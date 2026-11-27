-- 1. Ապրանքների կատեգորիաներ. համակարգը ինքն է դասավորում ըստ անվան, մատակարարը կարող է ուղղել։
-- 2. «Ով է գնում»՝ 🔴 չի գնում / 🟢 գնում է ձեր գնից էժան / 🟡 գնում է ձեր գնից թանկ (առանց ուրիշի գինը ցույց տալու)։
-- 3. Խանութը փնտրում է մատակարար («Փնտրում եմ ձու»), մատակարարները առաջարկ են ուղարկում։

-- ───────────── 1. Կատեգորիաներ ─────────────
create table if not exists category_keywords (category text not null, keyword text not null, primary key (category, keyword));
alter table category_keywords enable row level security;
create policy category_keywords_read on category_keywords for select to authenticated using (true);
grant select on category_keywords to authenticated;

insert into category_keywords (category, keyword)
select c, unnest(k) from (values
  ('Հացաբուլկեղեն', array['հաց', 'լավաշ', 'բաթոն', 'բուլկի', 'մատնաքաշ', 'բագետ', 'тост', 'хлеб', 'лаваш', 'батон', 'булк', 'багет']),
  ('Խմորեղեն և քաղցրավենիք', array['տորթ', 'թխվածք', 'կարկանդակ', 'գաթա', 'փախլավա', 'պեչենի', 'վաֆլի', 'շոկոլադ', 'կոնֆետ', 'քաղցր', 'кекс', 'торт', 'печень', 'вафл', 'шоколад', 'конфет', 'пирож']),
  ('Կաթնամթերք', array['կաթ', 'մածուն', 'թան', 'պանիր', 'կարագ', 'սերուցք', 'թթվասեր', 'կաթնաշոռ', 'յոգուրտ', 'кефир', 'молок', 'сыр', 'масло сливоч', 'сметан', 'творог', 'йогурт', 'сливк']),
  ('Ձու', array['ձու', 'ձվ', 'яйц', 'яйко']),
  ('Միս և երշիկեղեն', array['միս', 'հավ', 'տավար', 'խոզ', 'գառ', 'երշիկ', 'նրբերշիկ', 'բաստուրմա', 'սուջուխ', 'ապխտած', 'мяс', 'куриц', 'говяд', 'свин', 'колбас', 'сосиск', 'фарш', 'ветчин']),
  ('Ձուկ', array['ձուկ', 'ձկ', 'իշխան', 'սաղմոն', 'рыб', 'лосос', 'форел', 'сельд']),
  ('Մրգեր և բանջարեղեն', array['խնձոր', 'տանձ', 'բանան', 'նարինջ', 'կիտրոն', 'խաղող', 'լոլիկ', 'վարունգ', 'կարտոֆիլ', 'սոխ', 'սխտոր', 'կաղամբ', 'գազար', 'կանաչի', 'բանջար', 'միրգ', 'яблок', 'банан', 'помидор', 'огур', 'картоф', 'лук', 'овощ', 'фрукт', 'зелен']),
  ('Պահածոներ', array['պահածո', 'մուրաբա', 'ջեմ', 'թթու', 'կոնսերվ', 'լեչո', 'тушенк', 'консерв', 'варенье', 'джем', 'соленья']),
  ('Ըմպելիքներ', array['ջուր', 'հյութ', 'կոլա', 'լիմոնադ', 'ըմպելիք', 'սոդա', 'вода', 'сок', 'кола', 'лимонад', 'напит', 'газиров', 'энергет']),
  ('Ալկոհոլ', array['գինի', 'կոնյակ', 'օղի', 'գարեջուր', 'վիսկի', 'вино', 'коньяк', 'водк', 'пиво', 'виски', 'шампан']),
  ('Սուրճ և թեյ', array['սուրճ', 'թեյ', 'կակաո', 'кофе', 'чай', 'какао']),
  ('Ձավարեղեն և մակարոն', array['բրինձ', 'հնդկաձավար', 'ձավար', 'մակարոն', 'ալյուր', 'շաքար', 'աղ', 'լոբի', 'ոսպ', 'вермишел', 'рис', 'греч', 'макарон', 'мук', 'сахар', 'соль', 'фасол', 'чечевиц', 'крупа']),
  ('Ձեթ, համեմունք, սոուս', array['ձեթ', 'յուղ', 'քացախ', 'կետչուպ', 'մայոնեզ', 'սոուս', 'համեմունք', 'պղպեղ', 'масло подсолн', 'масло олив', 'уксус', 'кетчуп', 'майонез', 'соус', 'специ', 'перец']),
  ('Սառեցված մթերք', array['սառեցված', 'պաղպաղակ', 'խինկալի', 'պելմեն', 'замороз', 'мороженое', 'пельмен', 'хинкали']),
  ('Տնտեսական ապրանքներ', array['զուգարանի', 'անձեռոցիկ', 'օճառ', 'շամպուն', 'լվացքի', 'մաքրող', 'փոշի', 'տոպրակ', 'աղբի', 'սպունգ', 'ձեռնոց', 'бумага', 'салфет', 'мыло', 'шампун', 'порош', 'пакет', 'губк', 'перчат', 'моющ', 'чистящ'])
) v(c, k)
on conflict do nothing;

create or replace function guess_category(p_name text) returns text
language sql stable set search_path = public as $$
  select coalesce(
    (select k.category from category_keywords k
      where ' ' || search_skeleton(p_name) like '% ' || search_skeleton(k.keyword) || '%'
      order by length(search_skeleton(k.keyword)) desc limit 1),
    'Այլ')
$$;

alter table products add column if not exists category text;
alter table products add column if not exists category_auto boolean not null default true;   -- false՝ մատակարարը ինքն է ընտրել

create or replace function products_category() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.category_auto or new.category is null then new.category := guess_category(new.name); end if;
  return new;
end $$;
drop trigger if exists products_category on products;
create trigger products_category before insert or update of name, category_auto, category on products
  for each row execute function products_category();
update products set category = guess_category(name) where category_auto or category is null;
create index if not exists products_category_idx on products (category);

-- ───────────── 2. «Ով է գնում»՝ գնի համեմատությամբ ─────────────
drop function if exists shop_demand(text);
create function shop_demand(q text)
returns table (
  id uuid, name text, district text, address text, phone text, contact_person text,
  distance_km numeric, is_client boolean, qty_band text, unit text, last_band text, price_status text)
language sql stable security definer set search_path = public as $$
  with me as (select e.firm_id from employees e where e.user_id = (select auth.uid()) and e.active limit 1),
       f as (select firms.* from firms join me on me.firm_id = firms.id),
       k as (select search_skeleton(q) as key, q as raw),
       -- ապրանքները ըստ անվան կամ կատեգորիայի (օր.՝ «Հացաբուլկեղեն»)
       prods as (
         select p.id, p.firm_id, p.unit::text as unit, p.price from products p cross join k
         where length(k.key) >= 2 and (p.category = k.raw or p.search_key like k.key || '%' or p.search_key like '% ' || k.key || '%')
       ),
       -- իմ գինը համեմատության համար (ամենացածրը իմ համընկնող ապրանքներից)
       mine as (select unit, min(price) as price from prods where firm_id = (select firm_id from me) group by unit),
       bought as (
         select o.shop_id, pr.unit, sum(oi.qty) as qty, max(o.created_at) as last_at,
           (array_agg(oi.price order by o.created_at desc))[1] as last_price,
           bool_or(o.firm_id = (select firm_id from me)) as from_me
         from order_items oi
         join prods pr on pr.id = oi.product_id
         join orders o on o.id = oi.order_id
         where o.created_at > now() - interval '90 days' and o.status <> 'returned'
         group by o.shop_id, pr.unit
       ),
       best as (select distinct on (shop_id) * from bought order by shop_id, qty desc)
  select s.id, s.name, s.district, s.address, s.phone, s.contact_person,
    round(km_between(f.base_lat, f.base_lng, s.lat, s.lng)::numeric, 1),
    exists (select 1 from shop_firm_links l where l.shop_id = s.id and l.firm_id = f.id and l.status = 'active'),
    -- ամսական ծավալը (90 օր / 3)՝ միայն միջակայքով
    case when b.shop_id is null then null
         when b.qty / 3 < 10 then 'մինչև 10' when b.qty / 3 < 50 then '10–50' when b.qty / 3 < 100 then '50–100'
         when b.qty / 3 < 300 then '100–300' when b.qty / 3 < 500 then '300–500' when b.qty / 3 < 1000 then '500–1000'
         else '1000+' end,
    b.unit,
    case when b.shop_id is null then null
         when b.last_at > now() - interval '7 days' then 'այս շաբաթ'
         when b.last_at > now() - interval '30 days' then 'այս ամիս' else 'ավելի վաղ' end,
    -- 'none' չի գնում · 'mine' գնում է ինձանից · 'cheaper' / 'pricier' / 'same'՝ իմ գնի համեմատ (ուրիշի գինը չի երևում)
    case when b.shop_id is null then 'none'
         when b.from_me then 'mine'
         when m.price is null then null
         when b.last_price < m.price * 0.98 then 'cheaper'
         when b.last_price > m.price * 1.02 then 'pricier'
         else 'same' end
  from shops s cross join f
  left join best b on b.shop_id = s.id
  left join mine m on m.unit = b.unit
  where s.listed and length((select key from k)) >= 2
  order by (b.shop_id is null), b.qty desc nulls last, s.name
  limit 500
$$;
revoke execute on function shop_demand(text) from public, anon;
grant execute on function shop_demand(text) to authenticated;

-- ───────────── 3. Խանութը փնտրում է մատակարար ─────────────
create table if not exists supply_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops (id) on delete cascade,
  text text not null check (length(trim(text)) between 2 and 500),   -- «Ձու, շաբաթական 300 հատ»
  category text,
  price_hint numeric(12, 2) check (price_hint > 0),                     -- ըստ ցանկության
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists supply_requests_shop_idx on supply_requests (shop_id);
create index if not exists supply_requests_open_idx on supply_requests (status, created_at desc);

create table if not exists supply_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references supply_requests (id) on delete cascade,
  firm_id uuid not null references firms (id) on delete cascade,
  employee_id uuid references employees (id) on delete set null,
  text text not null check (length(trim(text)) between 1 and 1000),
  price numeric(12, 2) check (price > 0),
  created_at timestamptz not null default now(),
  unique (request_id, firm_id)
);
create index if not exists supply_offers_firm_idx on supply_offers (firm_id);
create index if not exists supply_offers_employee_idx on supply_offers (employee_id);

alter table supply_requests enable row level security;
alter table supply_offers enable row level security;

-- Հարցումը տեսնում են խանութը և բոլոր մատակարարների աշխատողները
create policy supply_requests_read on supply_requests for select to authenticated using (
  is_shop_member(shop_id) or ((select (my_employee()).id) is not null and (status = 'open' or created_at > now() - interval '30 days')));
create policy supply_requests_write on supply_requests for insert to authenticated with check (is_shop_member(shop_id));
create policy supply_requests_close on supply_requests for update to authenticated using (is_shop_member(shop_id)) with check (is_shop_member(shop_id));
grant select, insert on supply_requests to authenticated;
grant update (status) on supply_requests to authenticated;

-- Առաջարկը տեսնում են խանութը (իր հարցման համար) և առաջարկող ֆիրման
create policy supply_offers_read on supply_offers for select to authenticated using (
  firm_id = (select (my_employee()).firm_id)
  or exists (select 1 from supply_requests r where r.id = request_id and is_shop_member(r.shop_id)));
create policy supply_offers_write on supply_offers for insert to authenticated with check (
  firm_id = (select (my_employee()).firm_id) and employee_id = (select (my_employee()).id)
  and exists (select 1 from supply_requests r where r.id = request_id and r.status = 'open'));
grant select, insert on supply_offers to authenticated;

create or replace function supply_requests_fill() returns trigger
language plpgsql set search_path = public as $$
begin
  new.category := guess_category(new.text);
  return new;
end $$;
drop trigger if exists supply_requests_fill on supply_requests;
create trigger supply_requests_fill before insert on supply_requests for each row execute function supply_requests_fill();

-- Ծանուցումներ. նոր հարցում → այդ կատեգորիայի մատակարարների ղեկավարներին և թաղամասի մենեջերներին; նոր առաջարկ → խանութին
create or replace function supply_requests_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text := (select district from shops where id = new.shop_id);
begin
  perform push_to_users(
    array(select distinct e.user_id from employees e
          where e.active and e.user_id is not null
            and exists (select 1 from products p where p.firm_id = e.firm_id and p.category = new.category)
            and (e.role = 'admin' or (e.role = 'manager' and (cardinality(e.districts) = 0 or d = any(e.districts))))),
    '📣 Փնտրում են մատակարար', new.text, jsonb_build_object('supplyRequestId', new.id));
  return new;
end $$;
revoke execute on function supply_requests_notify() from public, anon, authenticated;
drop trigger if exists supply_requests_notify on supply_requests;
create trigger supply_requests_notify after insert on supply_requests for each row execute function supply_requests_notify();

create or replace function supply_offers_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_to_users(
    array(select m.user_id from shop_members m join supply_requests r on r.shop_id = m.shop_id where r.id = new.request_id),
    '💼 Նոր առաջարկ՝ ' || (select name from firms where id = new.firm_id), left(new.text, 120),
    jsonb_build_object('supplyRequestId', new.request_id));
  return new;
end $$;
revoke execute on function supply_offers_notify() from public, anon, authenticated;
drop trigger if exists supply_offers_notify on supply_offers;
create trigger supply_offers_notify after insert on supply_offers for each row execute function supply_offers_notify();
