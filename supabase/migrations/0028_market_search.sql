-- Շուկայի որոնում և ցուցակներ (2026-11-27)
-- 1. Խանութը որոնում է ապրանքը ԲՈԼՈՐ մատակարարների մոտ և դասավորում՝ էժանից / թանկից / մոտիկից / շատ վաճառվող։
-- 2. Մատակարարը տեսնում է «Բոլոր խանութները» (եթե խանութը չի թաքցրել իրեն)։
-- 3. Մենեջերը նշում է իր թաղամասերը. խանութը տեսնում է իր թաղամասի մենեջերին։

alter table shops add column if not exists listed boolean not null default true;   -- երևա՞լ մատակարարներին
grant update (listed) on shops to authenticated;

alter table employees add column if not exists districts text[] not null default '{}';

create or replace function set_my_districts(p_districts text[]) returns void
language sql security definer set search_path = public as $$
  update employees set districts = coalesce(p_districts, '{}') where user_id = (select auth.uid()) and active
$$;
revoke execute on function set_my_districts(text[]) from public, anon;
grant execute on function set_my_districts(text[]) to authenticated;

-- Ֆիրմայի մենեջերը տվյալ թաղամասի համար. ով է նշել այն → ով արդեն սպասարկում է այնտեղ → առաջին մենեջերը
create or replace function district_manager(p_firm uuid, p_district text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from employees where firm_id = p_firm and role = 'manager' and active and p_district = any(districts) order by name limit 1),
    (select l.manager_id from shop_firm_links l join shops s on s.id = l.shop_id
      where l.firm_id = p_firm and l.status = 'active' and s.district = p_district and l.manager_id is not null
      group by l.manager_id order by count(*) desc limit 1),
    (select id from employees where firm_id = p_firm and role = 'manager' and active order by name limit 1))
$$;
revoke execute on function district_manager(uuid, text) from public, anon, authenticated;

-- Միանալու հայտը գնում է խանութի թաղամասի մենեջերին
create or replace function request_join(p_firm uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := (select shop_id from shop_members where user_id = auth.uid() limit 1);
  mgr uuid;
begin
  if sid is null then raise exception 'Մուտք գործեք որպես խանութ'; end if;
  mgr := district_manager(p_firm, (select district from shops where id = sid));
  insert into shop_firm_links (shop_id, firm_id, manager_id, status)
    values (sid, p_firm, mgr, 'pending')
    on conflict (shop_id, firm_id) do nothing;
  perform push_to_users(
    array(select user_id from employees where firm_id = p_firm and active and user_id is not null and (role = 'admin' or id = mgr)),
    '🆕 Միանալու հայտ', (select name from shops where id = sid), jsonb_build_object('shopId', sid));
end $$;

create or replace function km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select case when lat1 is null or lat2 is null then null else
    6371 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
  end
$$;

-- Որոնում բոլոր մատակարարների մոտ (միայն խանութի համար)
-- p_sort: 'best' (համապատասխանություն) | 'cheap' | 'expensive' | 'near' | 'popular'
create or replace function market_search(q text, p_sort text default 'best', max_rows int default 40)
returns table (
  product_id uuid, firm_id uuid, firm_name text, firm_logo text, sku text, name text, unit text, pack_note text,
  price numeric, in_stock boolean, sold numeric, link_status text,
  manager_name text, manager_phone text, serves_district boolean, distance_km numeric)
language sql stable security definer set search_path = public as $$
  with me as (
    select s.* from shops s join shop_members m on m.shop_id = s.id where m.user_id = (select auth.uid()) limit 1
  ), k as (
    select search_skeleton(q) as key, upper(regexp_replace(q, '\s', '', 'g')) as code
  ), hits as (
    select p.*, f.name as fname, f.logo_url, f.base_lat, f.base_lng,
      (case
         when p.sku = k.code then 100
         when p.sku like k.code || '%' and length(k.code) >= 2 then 50
         when p.search_key like k.key || '%' then 30
         when p.search_key like '% ' || k.key || '%' then 25
         when p.search_key like '%' || k.key || '%' then 15
         else 0
       end + 10 * word_similarity(k.key, p.search_key))::real as score
    from products p join firms f on f.id = p.firm_id cross join k
    where length(k.key) >= 1 and exists (select 1 from me) and (
        p.sku = k.code
        or (length(k.code) >= 2 and p.sku like k.code || '%')
        or p.search_key like k.key || '%'
        or p.search_key like '% ' || k.key || '%'
        or (length(k.key) >= 3 and p.search_key like '%' || k.key || '%')
        or (length(k.key) >= 3 and k.key <% p.search_key))
    order by score desc
    limit 300
  ), rows as (
    select h.id, h.firm_id, h.fname, h.logo_url, h.sku, h.name, h.unit::text, h.pack_note, h.in_stock, h.score,
      -- միացած խանութը տեսնում է իր գինը, մնացածը՝ ֆիրմայի ընդհանուր գինը
      case when l.status = 'active' then price_for(me.id, h.id) else h.price end as price,
      coalesce((select sum(oi.qty) from order_items oi join orders o on o.id = oi.order_id
                where oi.product_id = h.id and o.created_at > now() - interval '90 days' and o.status <> 'returned'), 0) as sold,
      l.status as link_status,
      coalesce(l.manager_id, district_manager(h.firm_id, me.district)) as mgr,
      exists (select 1 from employees e where e.firm_id = h.firm_id and e.role = 'manager' and e.active and me.district = any(e.districts))
        or exists (select 1 from shop_firm_links l2 join shops s2 on s2.id = l2.shop_id
                   where l2.firm_id = h.firm_id and l2.status = 'active' and s2.district = me.district) as serves,
      km_between(me.lat, me.lng, h.base_lat, h.base_lng) as km
    from hits h cross join me
    left join shop_firm_links l on l.firm_id = h.firm_id and l.shop_id = me.id
  )
  select r.id, r.firm_id, r.fname, r.logo_url, r.sku, r.name, r.unit, r.pack_note, r.price, r.in_stock, r.sold, r.link_status,
    e.name, e.phone, r.serves, round(r.km::numeric, 1)
  from rows r left join employees e on e.id = r.mgr
  order by
    r.in_stock desc,
    case when p_sort = 'cheap' then r.price end asc,
    case when p_sort = 'expensive' then r.price end desc,
    case when p_sort = 'near' then (not r.serves)::int end asc,
    case when p_sort = 'near' then r.km end asc nulls last,
    case when p_sort = 'popular' then r.sold end desc,
    r.score desc, r.price asc
  limit greatest(1, least(max_rows, 100))
$$;
revoke execute on function market_search(text, text, int) from public, anon;
grant execute on function market_search(text, text, int) to authenticated;

-- Ֆիրմայի տեսականին՝ հիմա նաև ընդհանուր գնով (համեմատելու համար)
drop function if exists firm_assortment(uuid);
create function firm_assortment(p_firm uuid)
returns table (id uuid, sku text, name text, image_url text, unit text, pack_note text, in_stock boolean, price numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.sku, p.name, p.image_url, p.unit::text, p.pack_note, p.in_stock, p.price
  from products p
  where p.firm_id = p_firm and (select auth.uid()) is not null
  order by p.in_stock desc, p.name
  limit 300
$$;
revoke execute on function firm_assortment(uuid) from public, anon;
grant execute on function firm_assortment(uuid) to authenticated;

-- «Բոլոր խանութները»՝ միայն ֆիրմայի աշխատողների համար (խանութները, որոնք չեն թաքցրել իրենց)
create or replace function shop_directory()
returns table (id uuid, name text, district text, address text, phone text, contact_person text, distance_km numeric, is_client boolean)
language sql stable security definer set search_path = public as $$
  with me as (select e.firm_id from employees e where e.user_id = (select auth.uid()) and e.active limit 1),
       f as (select firms.* from firms join me on me.firm_id = firms.id)
  select s.id, s.name, s.district, s.address, s.phone, s.contact_person,
    round(km_between(f.base_lat, f.base_lng, s.lat, s.lng)::numeric, 1),
    exists (select 1 from shop_firm_links l where l.shop_id = s.id and l.firm_id = f.id and l.status = 'active')
  from shops s cross join f
  where s.listed
  order by s.name
  limit 1000
$$;
revoke execute on function shop_directory() from public, anon;
grant execute on function shop_directory() to authenticated;
