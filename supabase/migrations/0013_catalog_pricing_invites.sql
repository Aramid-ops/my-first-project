-- Ապրանքների կառավարում, նկարներ, անհատական գներ, սահմանաչափեր, հրավերներ, ցուցակներ, հիշեցում

-- ───────────── 1. Նկարներ (Storage) ─────────────
-- Հանրային ընթերցում; գրել՝ ֆիրմայի ադմին/աշխատող (firm/<firm_id>/...), խանութ (shop/<shop_id>/...)
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;

create policy media_read on storage.objects for select using (bucket_id = 'media');
create policy media_firm_write on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (storage.foldername(name))[1] = 'firm'
  and (storage.foldername(name))[2] = (my_employee()).firm_id::text and (my_employee()).role in ('admin', 'staff')
);
create policy media_shop_write on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (storage.foldername(name))[1] = 'shop' and is_shop_member(((storage.foldername(name))[2])::uuid)
);

-- Ֆիրմայի լոգո և տվյալներ՝ ադմինը
create policy firms_admin_update on firms for update to authenticated using (is_firm_admin(id)) with check (is_firm_admin(id));
grant update (name, category, logo_url, base_lat, base_lng) on firms to authenticated;

-- ───────────── 2. Անհատական գներ և սահմանաչափեր ─────────────
alter table shop_firm_links add column if not exists discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 90);
alter table shop_firm_links add column if not exists credit_limit numeric(12,2);   -- null = առանց սահմանի
alter table firms add column if not exists min_order_amount numeric(12,2) not null default 0;
grant update (discount_pct, credit_limit) on shop_firm_links to authenticated;
grant update (min_order_amount) on firms to authenticated;

-- Կոնկրետ խանութի համար կոնկրետ ապրանքի գին (գերակա զեղչից)
create table if not exists shop_prices (
  shop_id uuid references shops(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  primary key (shop_id, product_id)
);
alter table shop_prices enable row level security;
create policy shop_prices_read on shop_prices for select to authenticated using (
  is_shop_member(shop_id) or exists (select 1 from products p where p.id = product_id and p.firm_id = (my_employee()).firm_id)
);
create policy shop_prices_admin on shop_prices for all to authenticated using (
  exists (select 1 from products p where p.id = product_id and is_firm_admin(p.firm_id))
) with check (
  exists (select 1 from products p where p.id = product_id and is_firm_admin(p.firm_id))
);
grant select, insert, update, delete on shop_prices to authenticated;

-- Խանութի գինը. անհատական գին → կամ բազային գին − զեղչ
create or replace function price_for(p_shop uuid, p_product uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select price from shop_prices where shop_id = p_shop and product_id = p_product),
    round(p.price * (1 - coalesce(l.discount_pct, 0) / 100), 2))
  from products p left join shop_firm_links l on l.firm_id = p.firm_id and l.shop_id = p_shop
  where p.id = p_product
$$;
grant execute on function price_for(uuid, uuid) to authenticated;

-- Տողի գինը այժմ հաշվի է առնում խանութի գինը
create or replace function order_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p products;
  o orders;
  k numeric;
begin
  select * into o from orders where id = new.order_id;
  select * into p from products where id = new.product_id;
  if p.id is null or o.id is null or p.firm_id <> o.firm_id then
    raise exception 'Ապրանքը չի պատկանում այս մատակարարին';
  end if;
  if tg_op = 'INSERT' then
    if not p.in_stock then raise exception 'Ապրանքը առկա չէ. %', p.name; end if;
    if new.qty < p.min_qty then raise exception 'Նվազագույն քանակը՝ % %', trim_scale(p.min_qty), p.unit; end if;
    k := (new.qty - p.min_qty) / p.step;
    if k <> trunc(k) then raise exception 'Քանակը պետք է լինի % քայլով', trim_scale(p.step); end if;
    new.price := price_for(o.shop_id, p.id);
  else
    new.price := old.price;
    new.product_id := old.product_id;
    new.order_id := old.order_id;
  end if;
  return new;
end $$;

-- Պատվերի ստուգումներ (նվազագույն գումար, պարտքի սահմանաչափ)՝ բոլոր տողերը ավելացնելուց հետո
create or replace function check_order_limits(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders := (select o from orders o where o.id = p_order);
  total numeric := (select coalesce(sum(qty * price), 0) from order_items where order_id = p_order);
  minimum numeric := (select min_order_amount from firms where id = o.firm_id);
  lim numeric := (select credit_limit from shop_firm_links where shop_id = o.shop_id and firm_id = o.firm_id);
  owed numeric;
begin
  if total < minimum then
    raise exception 'Նվազագույն պատվերը այս մատակարարի համար՝ % ֏', trim_scale(minimum);
  end if;
  if lim is not null then
    select coalesce(sum(i.qty * i.price), 0) into owed
      from orders x join order_items i on i.order_id = x.id
      where x.shop_id = o.shop_id and x.firm_id = o.firm_id and x.status <> 'returned' and x.id <> p_order;
    owed := owed - coalesce((select sum(amount) from payments where shop_id = o.shop_id and firm_id = o.firm_id and confirmed_at is not null), 0);
    if owed + total > lim then
      raise exception 'Պարտքի սահմանաչափը (% ֏) գերազանցվում է. դիմեք մենեջերին', trim_scale(lim);
    end if;
  end if;
end $$;
-- Միայն ստուգում է (չի փոխում տվյալներ). place_order-ը (security invoker) պետք է կարողանա կանչել
revoke execute on function check_order_limits(uuid) from public, anon;
grant execute on function check_order_limits(uuid) to authenticated;

create or replace function place_order(p_shop uuid, p_firm uuid, p_delivery date, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  l shop_firm_links;
  oid uuid;
  it jsonb;
begin
  select * into l from shop_firm_links where shop_id = p_shop and firm_id = p_firm and status = 'active';
  if l.shop_id is null then raise exception 'Դուք կապված չեք այս մատակարարին'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Պատվերը դատարկ է'; end if;
  insert into orders (shop_id, firm_id, manager_id, assignee_id, status, delivery_date)
    values (p_shop, p_firm, l.manager_id, l.manager_id, 'sent', p_delivery) returning id into oid;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into order_items (order_id, product_id, qty, price) values (oid, (it->>'product_id')::uuid, (it->>'qty')::numeric, 0);
  end loop;
  perform check_order_limits(oid);
  insert into order_events (order_id, actor_name, text) values (oid, '', 'Ուղարկեց պատվերը');
  return oid;
end $$;

-- Խանութը տեսնում է իր գները (կատալոգում)
create or replace function my_prices(p_firm uuid)
returns table (product_id uuid, price numeric)
language sql stable security definer set search_path = public as $$
  select p.id, price_for(m.shop_id, p.id)
  from products p join shop_members m on m.user_id = auth.uid()
  join shop_firm_links l on l.shop_id = m.shop_id and l.firm_id = p.firm_id and l.status = 'active'
  where p.firm_id = p_firm
$$;
grant execute on function my_prices(uuid) to authenticated;

-- ───────────── 3. Աշխատողների հրավեր ─────────────
-- Ղեկավարը ստեղծում է աշխատողին → ստանում է 6-նիշ կոդ → աշխատողը գրանցվում է կոդով
alter table employees add column if not exists invite_code text unique;

create or replace function invite_employee(p_name text, p_role employee_role, p_department text default null, p_phone text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  me employees := (select e from employees e where e.user_id = auth.uid() and e.active limit 1);
  code text;
begin
  if me.id is null or me.role <> 'admin' then raise exception 'Միայն ղեկավարը'; end if;
  if p_role = 'admin' then raise exception 'Ղեկավար ավելացնել հնարավոր չէ այստեղից'; end if;
  loop
    code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from employees where invite_code = code);
  end loop;
  insert into employees (firm_id, name, role, department, phone, invite_code)
    values (me.firm_id, p_name, p_role, nullif(p_department, ''), nullif(p_phone, ''), code);
  return code;
end $$;
grant execute on function invite_employee(text, employee_role, text, text) to authenticated;

-- Գրանցում. kind = 'employee' + code → կապում ենք աշխատողին
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  sid uuid;
begin
  if m->>'kind' = 'shop' and coalesce(m->>'name', '') <> '' then
    insert into shops (name, legal_name, tax_id, city, district, address, phone, email, contact_person)
    values (m->>'name', m->>'legal_name', coalesce(m->>'tax_id', ''), coalesce(m->>'city', 'Երևան'),
            m->>'district', m->>'address', m->>'phone', coalesce(m->>'email', new.email), m->>'contact_person')
    returning id into sid;
    insert into shop_members (shop_id, user_id) values (sid, new.id);
  elsif m->>'kind' = 'employee' and coalesce(m->>'code', '') <> '' then
    update employees set user_id = new.id, invite_code = null
      where invite_code = m->>'code' and user_id is null;
  end if;
  return new;
end $$;

-- ───────────── 4. Պահված ցուցակներ ─────────────
create table if not exists saved_lists (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]',   -- [{"product_id": "...", "qty": 30}]
  created_at timestamptz not null default now()
);
alter table saved_lists enable row level security;
create policy saved_lists_own on saved_lists for all to authenticated using (is_shop_member(shop_id)) with check (is_shop_member(shop_id));
grant select, insert, update, delete on saved_lists to authenticated;

-- ───────────── 5. Խնդրի լուսանկար ─────────────
-- order_issues.photo_url արդեն կա (0001)

-- ───────────── 6. Վերջնաժամի հիշեցում ─────────────
-- Ամեն 15 րոպեն մեկ. եթե գծի վերջնաժամին մնացել է ≤ 1 ժամ, իսկ վաղը գծի օր է,
-- և խանութը այսօր դեռ չի պատվիրել այդ ֆիրմայից → ծանուցում (մեկ անգամ օրական)
create table if not exists cutoff_reminders_sent (
  shop_id uuid, firm_id uuid, day date, primary key (shop_id, firm_id, day)
);
alter table cutoff_reminders_sent enable row level security;

create or replace function send_cutoff_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  now_am timestamp := now() at time zone 'Asia/Yerevan';
  tomorrow int := extract(isodow from (now_am + interval '1 day'))::int;
begin
  for r in
    select l.shop_id, l.firm_id, ln.order_cutoff, f.name firm_name
    from shop_firm_links l join lines ln on ln.id = l.line_id join firms f on f.id = l.firm_id
    where l.status = 'active' and ln.order_cutoff is not null
      and (cardinality(ln.delivery_days) = 0 or tomorrow = any(ln.delivery_days))
      and now_am::time between ln.order_cutoff - interval '1 hour' and ln.order_cutoff
      and not exists (select 1 from orders o where o.shop_id = l.shop_id and o.firm_id = l.firm_id
                      and (o.created_at at time zone 'Asia/Yerevan')::date = now_am::date)
      and not exists (select 1 from cutoff_reminders_sent c where c.shop_id = l.shop_id and c.firm_id = l.firm_id and c.day = now_am::date)
  loop
    perform push_to_users(array(select user_id from shop_members where shop_id = r.shop_id), r.firm_name,
      '⏰ Վաղվա առաքման համար պատվիրեք մինչև ' || to_char(r.order_cutoff, 'HH24:MI'), jsonb_build_object('firmId', r.firm_id));
    insert into cutoff_reminders_sent values (r.shop_id, r.firm_id, now_am::date);
  end loop;
end $$;
revoke execute on function send_cutoff_reminders() from public, anon, authenticated;

-- ───────────── 7. Գովազդվող մատակարարներ ─────────────
-- Վճարող մատակարարները միշտ երևում են խանութի գլխավոր էջում («Առաջարկվող մատակարարներ»)
alter table firms add column if not exists featured_until date;
