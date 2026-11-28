-- 2026-11-28 · SPEC §31
--   17. Ֆիրմայի պրոֆիլ. կատեգորիաներ, առաքման տարածք, թաղամաս
--   20. 📦 Պահեստ. մուտք / ելք / մնացորդ, 0-ում՝ «Չկա», «քիչ է մնացել» ծանուցում, դուրսգրում, ուղղում
--   21. Պատվերի ուղղում. ուղարկվող քանակ և գին կոնկրետ պատվերի համար
--   22. Փոխարինող ապրանք (խանութը ✅ / ❌)
--   23. Ակցիա «միայն իմ հաճախորդներին»
--   24. Վճարման ժամկետ և ժամկետանց հիշեցում

-- Պատվերի տողի նոր դաշտեր (օգտագործվում են ներքևում)
alter table order_items add column if not exists sent_qty numeric(12, 3) check (sent_qty >= 0);       -- ուղարկվող քանակ (դատարկ՝ ինչքան պատվիրել է)
alter table order_items add column if not exists final_price numeric(12, 2) check (final_price >= 0);  -- գին այս պատվերում (դատարկ՝ ինչպես պատվիրել է)
alter table order_items add column if not exists sub_product_id uuid references products (id) on delete set null;
alter table order_items add column if not exists sub_qty numeric(12, 3) check (sub_qty > 0);
alter table order_items add column if not exists sub_status text check (sub_status in ('proposed', 'accepted', 'rejected'));
create index if not exists order_items_sub_product_idx on order_items (sub_product_id);

-- ───────────── 17. Ֆիրմայի պրոֆիլ ─────────────
alter table firms add column if not exists categories text[] not null default '{}';
alter table firms add column if not exists service_areas text[] not null default '{}';   -- 'Ամբողջ Երևան', թաղամասեր, մարզեր
alter table firms add column if not exists district text;
grant update (categories, service_areas, district) on firms to authenticated;

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
                   where l2.firm_id = h.firm_id and l2.status = 'active' and s2.district = me.district)
        -- ֆիրմայի նշած առաքման տարածքը (թաղամաս կամ «Ամբողջ Երևան»)
        or exists (select 1 from firms ff where ff.id = h.firm_id
                   and (me.district = any(ff.service_areas) or ('Ամբողջ Երևան' = any(ff.service_areas) and coalesce(me.city, 'Երևան') = 'Երևան'))) as serves,
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

-- «Փնտրում եմ մատակարար» ծանուցումը՝ նաև ֆիրմայի նշած կատեգորիաներով
create or replace function supply_requests_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text := (select district from shops where id = new.shop_id);
begin
  perform push_to_users(
    array(select distinct e.user_id from employees e join firms f on f.id = e.firm_id
          where e.active and e.user_id is not null
            and (new.category = any(f.categories) or exists (select 1 from products p where p.firm_id = e.firm_id and p.category = new.category))
            and (e.role = 'admin' or (e.role = 'manager' and (cardinality(e.districts) = 0 or d = any(e.districts))))),
    '📣 Փնտրում են մատակարար', new.text, jsonb_build_object('supplyRequestId', new.id));
  return new;
end $$;

-- ───────────── Նոր թույլտվություններ. 📦 պահեստ, ✏️ պատվերի ուղղում ─────────────
alter table firm_perms drop constraint if exists firm_perms_perm_check;
alter table firm_perms add constraint firm_perms_perm_check check (perm in
  ('shops_new', 'shop_terms', 'blacklist', 'lines', 'products', 'invite', 'payments_view', 'payments_confirm', 'stock', 'order_edit'));

create or replace function default_perm(r employee_role, p text) returns boolean
language sql immutable set search_path = public as $$
  select case r
    when 'manager' then p in ('shops_new', 'shop_terms', 'lines', 'payments_view', 'order_edit')
    when 'staff' then p in ('shops_new', 'shop_terms', 'lines', 'products', 'payments_view', 'stock', 'order_edit')
    else false end
$$;

create or replace function my_permissions() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p), '{}') from unnest(array['shops_new', 'shop_terms', 'blacklist', 'lines', 'products', 'invite',
    'payments_view', 'payments_confirm', 'stock', 'order_edit']) p
  where has_perm(p, (select (my_employee()).firm_id))
$$;

-- ───────────── 20. 📦 Պահեստ ─────────────
create table if not exists stock_moves (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  qty numeric(12, 3) not null check (qty <> 0),                  -- + մուտք, − ելք
  kind text not null check (kind in ('in', 'out', 'writeoff', 'adjust')),
  order_id uuid references orders (id) on delete set null,
  note text check (length(note) <= 300),
  employee_id uuid references employees (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_moves_product_idx on stock_moves (product_id, created_at desc);
create index if not exists stock_moves_firm_idx on stock_moves (firm_id);
create index if not exists stock_moves_order_idx on stock_moves (order_id);
create index if not exists stock_moves_employee_idx on stock_moves (employee_id);
alter table products add column if not exists low_stock numeric(12, 3) check (low_stock >= 0);   -- «քիչ է մնացել» սահման

alter table stock_moves enable row level security;
create policy stock_moves_read on stock_moves for select to authenticated using (firm_id = (select (my_employee()).firm_id));
create policy stock_moves_write on stock_moves for insert to authenticated with check (
  firm_id = (select (my_employee()).firm_id) and has_perm('stock', firm_id) and kind in ('in', 'writeoff')
  and employee_id = (select (my_employee()).id)
  and exists (select 1 from products p where p.id = product_id and p.firm_id = stock_moves.firm_id));
grant select, insert on stock_moves to authenticated;

-- Մնացորդ = մուտքեր − ելքեր; «պատվիրված» = ընդունված, դեռ չառաքված պատվերներ
create or replace function stock_balance()
returns table (product_id uuid, balance numeric, reserved numeric, last_in timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select (my_employee()).firm_id as firm_id)
  select p.id,
    coalesce((select sum(m.qty) from stock_moves m where m.product_id = p.id), 0),
    coalesce((select sum(coalesce(i.sent_qty, i.qty)) from order_items i join orders o on o.id = i.order_id
              where i.product_id = p.id and o.status in ('sent', 'accepted', 'preparing', 'on_the_way')), 0),
    (select max(created_at) from stock_moves m where m.product_id = p.id and m.kind = 'in')
  from products p cross join me
  where p.firm_id = me.firm_id and exists (select 1 from stock_moves m where m.product_id = p.id)
$$;
revoke execute on function stock_balance() from public, anon;
grant execute on function stock_balance() to authenticated;

-- Փաստացի մնացորդի ուղղում (գույքագրում)
create or replace function set_actual_stock(p_product uuid, p_actual numeric, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  me employees := my_employee();
  cur numeric := coalesce((select sum(qty) from stock_moves where product_id = p_product), 0);
begin
  if me.id is null or not has_perm('stock', me.firm_id) then raise exception 'Թույլտվություն չունեք'; end if;
  if not exists (select 1 from products where id = p_product and firm_id = me.firm_id) then raise exception 'Ապրանքը չի գտնվել'; end if;
  if p_actual < 0 then raise exception 'Մնացորդը չի կարող լինել բացասական'; end if;
  if p_actual <> cur then
    insert into stock_moves (firm_id, product_id, qty, kind, note, employee_id)
      values (me.firm_id, p_product, p_actual - cur, 'adjust', coalesce(nullif(trim(p_note), ''), 'Գույքագրում'), me.id);
  end if;
end $$;
revoke execute on function set_actual_stock(uuid, numeric, text) from public, anon;
grant execute on function set_actual_stock(uuid, numeric, text) to authenticated;

-- Պատվերը առաքվեց → ելք պահեստից (կշռվողը՝ իրական քաշով, ուղղվածը՝ ուղարկված քանակով)
create or replace function orders_stock_out() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'delivered' and old.status <> 'delivered' then
    insert into stock_moves (firm_id, product_id, qty, kind, order_id)
      select new.firm_id, i.product_id, -coalesce(i.actual_qty, i.sent_qty, i.qty), 'out', new.id
      from order_items i
      where i.order_id = new.id and coalesce(i.actual_qty, i.sent_qty, i.qty) > 0
        and exists (select 1 from stock_moves m where m.product_id = i.product_id);   -- միայն հաշվառվող ապրանքները
  end if;
  return new;
end $$;
revoke execute on function orders_stock_out() from public, anon, authenticated;
drop trigger if exists orders_stock_out on orders;
create trigger orders_stock_out after update of status on orders for each row execute function orders_stock_out();

-- Մնացորդը փոխվեց → «Չկա» / «Առկա է» ինքնաբերաբար, «քիչ է մնացել» ծանուցում
create or replace function stock_moves_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  bal numeric := coalesce((select sum(qty) from stock_moves where product_id = new.product_id), 0);
  p products := (select p from products p where p.id = new.product_id);
begin
  update products set in_stock = bal > 0 where id = new.product_id and in_stock is distinct from (bal > 0);
  if p.low_stock is not null and bal <= p.low_stock and bal - new.qty > p.low_stock then
    perform push_to_users(
      array(select e.user_id from employees e where e.firm_id = new.firm_id and e.active and e.user_id is not null and emp_has_perm(e.id, 'stock')),
      '⚠️ Քիչ է մնացել', p.name || '՝ ' || trim_scale(bal)::text || ' ' || p.unit::text, jsonb_build_object('productId', p.id));
  end if;
  return new;
end $$;
revoke execute on function stock_moves_after() from public, anon, authenticated;
drop trigger if exists stock_moves_after on stock_moves;
create trigger stock_moves_after after insert on stock_moves for each row execute function stock_moves_after();

-- ───────────── 21–22. Պատվերի ուղղում և փոխարինող ապրանք ─────────────

-- Պարտքը՝ ուղղված քանակով և գնով
create or replace function debts()
returns table (shop_id uuid, firm_id uuid, delivered numeric, paid numeric, pending numeric, debt numeric)
language sql stable security invoker set search_path = public as $$
  with d as (
    select o.shop_id, o.firm_id, sum(coalesce(i.actual_qty, i.sent_qty, i.qty) * coalesce(i.final_price, i.price)) amt
    from orders o join order_items i on i.order_id = o.id
    where o.status = 'delivered' group by 1, 2
  ), p as (
    select shop_id, firm_id,
      sum(amount) filter (where confirmed_at is not null) paid,
      sum(amount) filter (where confirmed_at is null) pending
    from payments group by 1, 2
  )
  select coalesce(d.shop_id, p.shop_id), coalesce(d.firm_id, p.firm_id),
    coalesce(d.amt, 0), coalesce(p.paid, 0), coalesce(p.pending, 0),
    coalesce(d.amt, 0) - coalesce(p.paid, 0)
  from d full join p on p.shop_id = d.shop_id and p.firm_id = d.firm_id
$$;

-- Ով կարող է ուղղել. «✏️ Պատվերի ուղղում» թույլտվությամբ, մինչև առաքելը
create or replace function can_edit_order(o orders) returns boolean
language sql stable security definer set search_path = public as $$
  select o.status in ('sent', 'accepted', 'preparing', 'on_the_way') and has_perm('order_edit', o.firm_id)
    and ((select (my_employee()).role) <> 'manager' or o.manager_id = (select (my_employee()).id) or not firm_has_admin(o.firm_id))
$$;

create or replace function edit_order_item(p_item uuid, p_sent_qty numeric, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  i order_items := (select i from order_items i where i.id = p_item);
  o orders := (select o from orders o where o.id = i.order_id);
  pname text := (select name from products where id = i.product_id);
  parts text[] := '{}';
begin
  if i.id is null or not can_edit_order(o) then raise exception 'Թույլտվություն չունեք'; end if;
  if p_sent_qty is not null and p_sent_qty < 0 or p_price is not null and p_price < 0 then raise exception 'Սխալ արժեք'; end if;
  update order_items set sent_qty = p_sent_qty, final_price = p_price where id = p_item;
  if p_sent_qty is not null and p_sent_qty <> i.qty then parts := parts || (trim_scale(i.qty)::text || ' → ' || trim_scale(p_sent_qty)::text); end if;
  if p_price is not null and p_price <> i.price then parts := parts || (trim_scale(i.price)::text || ' → ' || trim_scale(p_price)::text || ' ֏'); end if;
  if cardinality(parts) > 0 then
    insert into order_events (order_id, actor_name, text) values (o.id, '', '✏️ ' || pname || '. ' || array_to_string(parts, ', '));
    perform push_to_users(array(select user_id from shop_members where shop_id = o.shop_id),
      '✏️ ' || (select name from firms where id = o.firm_id), pname || '. ' || array_to_string(parts, ', '), jsonb_build_object('orderId', o.id));
  end if;
end $$;

create or replace function propose_substitute(p_item uuid, p_product uuid, p_qty numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  i order_items := (select i from order_items i where i.id = p_item);
  o orders := (select o from orders o where o.id = i.order_id);
begin
  if i.id is null or not can_edit_order(o) then raise exception 'Թույլտվություն չունեք'; end if;
  if not exists (select 1 from products where id = p_product and firm_id = o.firm_id and in_stock) then raise exception 'Փոխարինողը առկա չէ'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Նշեք քանակը'; end if;
  update order_items set sub_product_id = p_product, sub_qty = p_qty, sub_status = 'proposed' where id = p_item;
  insert into order_events (order_id, actor_name, text) values (o.id, '',
    '🔄 Առաջարկում է փոխարինել. ' || (select name from products where id = i.product_id) || ' → ' || (select name from products where id = p_product) || ' × ' || trim_scale(p_qty)::text);
  perform push_to_users(array(select user_id from shop_members where shop_id = o.shop_id),
    '🔄 ' || (select name from firms where id = o.firm_id), 'Առաջարկում է փոխարինող ապրանք. հաստատեք', jsonb_build_object('orderId', o.id));
end $$;

create or replace function answer_substitute(p_item uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  i order_items := (select i from order_items i where i.id = p_item);
  o orders := (select o from orders o where o.id = i.order_id);
begin
  if i.id is null or i.sub_status <> 'proposed' or not is_shop_member(o.shop_id) then raise exception 'Չի գտնվել'; end if;
  if p_accept then
    perform set_config('app.order_edit', 'on', true);
    update order_items set product_id = i.sub_product_id, qty = i.sub_qty, sent_qty = null, final_price = null,
      price = price_for(o.shop_id, i.sub_product_id), sub_status = 'accepted' where id = p_item;
    perform set_config('app.order_edit', 'off', true);
  else
    update order_items set sub_status = 'rejected' where id = p_item;
  end if;
  insert into order_events (order_id, actor_name, text) values (o.id, '', case when p_accept then '✅ Խանութը ընդունեց փոխարինումը' else '❌ Խանութը մերժեց փոխարինումը' end);
  perform push_to_users(array(select user_id from employees where id in (o.manager_id, o.assignee_id) and user_id is not null),
    (select name from shops where id = o.shop_id), case when p_accept then '✅ Ընդունեց փոխարինումը' else '❌ Մերժեց փոխարինումը' end, jsonb_build_object('orderId', o.id));
end $$;

revoke execute on function can_edit_order(orders), edit_order_item(uuid, numeric, numeric), propose_substitute(uuid, uuid, numeric), answer_substitute(uuid, boolean) from public, anon;
grant execute on function edit_order_item(uuid, numeric, numeric), propose_substitute(uuid, uuid, numeric), answer_substitute(uuid, boolean) to authenticated;

-- Գինը / ապրանքը տողում փոխվում են միայն փոխարինումը ընդունելիս
create or replace function order_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p products;
  o orders;
  k numeric;
begin
  if tg_op = 'UPDATE' and current_setting('app.order_edit', true) = 'on' then return new; end if;
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

-- ───────────── 23. Ակցիա «միայն իմ հաճախորդներին» ─────────────
alter table supplier_deals add column if not exists audience text not null default 'all' check (audience in ('all', 'clients'));

create or replace function supplier_deals_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.audience = 'clients' then
    perform push_to_users(
      array(select m.user_id from shop_members m join shop_firm_links l on l.shop_id = m.shop_id
            where l.firm_id = new.firm_id and l.status = 'active'),
      '🎁 ' || (select name from firms where id = new.firm_id), left(new.text, 120), jsonb_build_object('dealId', new.id));
  end if;
  return new;
end $$;
revoke execute on function supplier_deals_notify() from public, anon, authenticated;
drop trigger if exists supplier_deals_notify on supplier_deals;
create trigger supplier_deals_notify after insert on supplier_deals for each row execute function supplier_deals_notify();

drop function if exists live_deals();
create function live_deals()
returns table (id uuid, firm_id uuid, firm_name text, firm_logo text, text text, category text, price numeric,
               created_at timestamptz, employee_name text, phone text, mine boolean, interested boolean, interests int, qty numeric, unit text, audience text)
language sql stable security definer set search_path = public as $$
  with me as (select (select e.firm_id from employees e where e.user_id = (select auth.uid()) and e.active limit 1) as firm_id,
                     (select m.shop_id from shop_members m where m.user_id = (select auth.uid()) limit 1) as shop_id)
  select d.id, d.firm_id, f.name, f.logo_url, d.text, d.category, d.price, d.created_at,
    e.name, coalesce(e.phone, f.phone),
    d.firm_id = me.firm_id,
    exists (select 1 from deal_interests i where i.deal_id = d.id and i.shop_id = me.shop_id),
    case when d.firm_id = me.firm_id then (select count(*)::int from deal_interests i where i.deal_id = d.id) end,
    d.qty, d.unit, d.audience
  from supplier_deals d join firms f on f.id = d.firm_id left join employees e on e.id = d.employee_id cross join me
  where d.status = 'open' and d.created_at > now() - interval '30 days' and (select auth.uid()) is not null
    -- «միայն հաճախորդներին»՝ տեսնում են ֆիրման ինքը և նրա ակտիվ հաճախորդները
    and (d.audience = 'all' or d.firm_id = me.firm_id
         or exists (select 1 from shop_firm_links l where l.firm_id = d.firm_id and l.shop_id = me.shop_id and l.status = 'active'))
  order by d.created_at desc
  limit 200
$$;
revoke execute on function live_deals() from public, anon;
grant execute on function live_deals() to authenticated;
drop policy if exists supplier_deals_read on supplier_deals;
create policy supplier_deals_read on supplier_deals for select to authenticated using (
  audience = 'all' or firm_id = (select (my_employee()).firm_id)
  or exists (select 1 from shop_firm_links l where l.firm_id = supplier_deals.firm_id and l.status = 'active' and is_shop_member(l.shop_id)));

-- ───────────── 24. Վճարման ժամկետ ─────────────
alter table shop_firm_links add column if not exists payment_days int check (payment_days between 0 and 180);

-- Ժամկետանց պարտք = (ժամկետն անցած առաքված պատվերների գումար) − (բոլոր հաստատված վճարումներ), եթե դրական է
create or replace function overdue_debts()
returns table (shop_id uuid, firm_id uuid, overdue numeric, days_late int)
language sql stable security invoker set search_path = public as $$
  select l.shop_id, l.firm_id,
    greatest(0, coalesce(sum(coalesce(i.actual_qty, i.sent_qty, i.qty) * coalesce(i.final_price, i.price)), 0)
      - coalesce((select sum(amount) from payments p where p.shop_id = l.shop_id and p.firm_id = l.firm_id and p.confirmed_at is not null), 0)),
    coalesce(max(current_date - (o.delivery_date + l.payment_days)), 0)::int
  from shop_firm_links l
  join orders o on o.shop_id = l.shop_id and o.firm_id = l.firm_id and o.status = 'delivered' and o.delivery_date + l.payment_days < current_date
  join order_items i on i.order_id = o.id
  where l.payment_days is not null
  group by l.shop_id, l.firm_id
$$;
grant execute on function overdue_debts() to authenticated;

create table if not exists overdue_reminders_sent (shop_id uuid, firm_id uuid, day date, primary key (shop_id, firm_id, day));
alter table overdue_reminders_sent enable row level security;

create or replace function send_overdue_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select * from overdue_debts() d where d.overdue > 0
    and not exists (select 1 from overdue_reminders_sent s where s.shop_id = d.shop_id and s.firm_id = d.firm_id and s.day = current_date)
  loop
    perform push_to_users(array(select user_id from shop_members where shop_id = r.shop_id),
      (select name from firms where id = r.firm_id), '⏰ Ժամկետանց պարտք՝ ' || trim_scale(round(r.overdue))::text || ' ֏', jsonb_build_object('firmId', r.firm_id));
    perform push_to_users(array(select e.user_id from employees e join shop_firm_links l on l.manager_id = e.id
                                where l.shop_id = r.shop_id and l.firm_id = r.firm_id and e.user_id is not null),
      '⏰ ' || (select name from shops where id = r.shop_id), 'Ժամկետանց պարտք՝ ' || trim_scale(round(r.overdue))::text || ' ֏', jsonb_build_object('shopId', r.shop_id));
    insert into overdue_reminders_sent values (r.shop_id, r.firm_id, current_date);
  end loop;
end $$;
revoke execute on function send_overdue_reminders() from public, anon, authenticated;
