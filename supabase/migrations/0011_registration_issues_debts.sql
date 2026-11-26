-- Գրանցում, միանալու հայտ, խնդրի նշում, պարտքեր, վերջնաժամ, մենեջերի պատվեր (SPEC §4.3.1, §6, §7)

-- ───────────── 1. Խանութի ամբողջական տվյալներ ─────────────
alter table shops add column if not exists legal_name text;
alter table shops add column if not exists email text;
alter table shops add column if not exists contact_person text;

-- Խանութը կարող է թարմացնել իր տվյալները
create policy shops_update_own on shops for update to authenticated
  using (is_shop_member(id)) with check (is_shop_member(id));
grant update (name, legal_name, tax_id, city, district, address, lat, lng, phone, email, contact_person) on shops to authenticated;

-- Գրանցում. auth.users-ի նոր օգտատիրոջ metadata-ից (kind = 'shop') ստեղծվում է խանութը
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
  end if;
  return new;
end $$;
revoke execute on function handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ───────────── 2. Միանալու հայտ ─────────────
-- Խանութը ուղարկում է հայտ; մենեջերը առաջարկվում է ավտոմատ՝ նույն թաղամասի խանութների մենեջերը
create or replace function request_join(p_firm uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := (select shop_id from shop_members where user_id = auth.uid() limit 1);
  d text;
  mgr uuid;
begin
  if sid is null then raise exception 'Մուտք գործեք որպես խանութ'; end if;
  select district into d from shops where id = sid;
  select l.manager_id into mgr from shop_firm_links l join shops s on s.id = l.shop_id
    where l.firm_id = p_firm and l.status = 'active' and s.district = d and l.manager_id is not null
    group by l.manager_id order by count(*) desc limit 1;
  insert into shop_firm_links (shop_id, firm_id, manager_id, status)
    values (sid, p_firm, mgr, 'pending')
    on conflict (shop_id, firm_id) do nothing;
  perform push_to_users(
    array(select user_id from employees where firm_id = p_firm and active and user_id is not null
          and (role = 'admin' or id = mgr)),
    '🆕 Միանալու հայտ', (select name from shops where id = sid), jsonb_build_object('shopId', sid));
end $$;
grant execute on function request_join(uuid) to authenticated;

-- Մենեջերը կարող է ընդունել pending հայտը՝ իրեն նշանակելով; մնացածը՝ ղեկավարը
create or replace function links_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select id from employees where user_id = auth.uid() and active limit 1);
begin
  new.shop_id := old.shop_id;
  new.firm_id := old.firm_id;
  if not is_firm_admin(old.firm_id) then
    if old.status = 'pending' and new.status = 'active' and new.manager_id = me then
      null;  -- մենեջերը ընդունում է հայտը իր վրա
    else
      new.manager_id := old.manager_id;
      new.status := old.status;
    end if;
  end if;
  if new.line_id is not null and not exists (select 1 from lines where id = new.line_id and firm_id = old.firm_id) then
    raise exception 'Գիծը չի պատկանում այս ֆիրմային';
  end if;
  return new;
end $$;

drop policy if exists links_update on shop_firm_links;
create policy links_update on shop_firm_links for update to authenticated using (
  is_firm_admin(firm_id) or manager_id = (my_employee()).id
  or (status = 'pending' and firm_id = (my_employee()).firm_id and (my_employee()).role = 'manager')
) with check (firm_id = (my_employee()).firm_id);

-- Հայտ ընդունվեց → ծանուցում խանութին
create or replace function links_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'active' then
    perform push_to_users(array(select user_id from shop_members where shop_id = new.shop_id),
      (select name from firms where id = new.firm_id), '✅ Հայտը ընդունված է. կարող եք պատվիրել', jsonb_build_object('firmId', new.firm_id));
  end if;
  return new;
end $$;
revoke execute on function links_notify() from public, anon, authenticated;
drop trigger if exists links_notify on shop_firm_links;
create trigger links_notify after update on shop_firm_links for each row execute function links_notify();

-- ───────────── 3. Խնդրի նշում (միայն տեղեկություն) ─────────────
create or replace function issues_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o orders := (select o from orders o where o.id = new.order_id);
  pname text := coalesce((select name from products where id = new.product_id), 'ապրանք');
  k text := case new.kind when 'broken' then 'ջարդված' when 'missing' then 'պակաս'
                          when 'wrong' then 'սխալ ապրանք' else 'ժամկետանց' end;
begin
  perform push_to_users(
    array(select user_id from employees where id in (o.manager_id, o.driver_id) and user_id is not null),
    '⚠️ ' || (select name from shops where id = o.shop_id),
    pname || ' · ' || coalesce(trim_scale(new.qty)::text || ' ', '') || k, jsonb_build_object('orderId', o.id));
  return new;
end $$;
revoke execute on function issues_notify() from public, anon, authenticated;
drop trigger if exists issues_notify on order_issues;
create trigger issues_notify after insert on order_issues for each row execute function issues_notify();

-- ───────────── 4. Պատվերի վերջնաժամ ─────────────
alter table lines add column if not exists order_cutoff time;   -- օր.՝ 18:00. դրանից հետո՝ հաջորդ գծին

-- ───────────── 5. Մենեջերը պատվեր է ստեղծում խանութի անունից ─────────────
create or replace function place_order_for_shop(p_shop uuid, p_firm uuid, p_delivery date, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me employees := (select e from employees e where e.user_id = auth.uid() and e.active limit 1);
  l shop_firm_links;
  oid uuid;
  it jsonb;
begin
  select * into l from shop_firm_links where shop_id = p_shop and firm_id = p_firm and status = 'active';
  if l.shop_id is null or me.id is null or me.firm_id <> p_firm
     or not (l.manager_id = me.id or me.role = 'admin') then
    raise exception 'Դուք այս խանութի մենեջերը չեք';
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Պատվերը դատարկ է'; end if;
  insert into orders (shop_id, firm_id, manager_id, assignee_id, status, delivery_date)
    values (p_shop, p_firm, l.manager_id, l.manager_id, 'accepted', p_delivery) returning id into oid;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into order_items (order_id, product_id, qty, price) values (oid, (it->>'product_id')::uuid, (it->>'qty')::numeric, 0);
  end loop;
  insert into order_events (order_id, actor_name, text) values (oid, '', 'Ստեղծեց պատվերը խանութի անունից');
  return oid;
end $$;
grant execute on function place_order_for_shop(uuid, uuid, date, jsonb) to authenticated;

-- Նոր պատվերի ծանուցումը՝ միայն երբ խանութն է ուղարկել (ոչ մենեջերի ստեղծածի համար)
create or replace function orders_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  shop_name text := (select name from shops where id = new.shop_id);
  firm_name text := (select name from firms where id = new.firm_id);
  shop_users uuid[] := array(select user_id from shop_members where shop_id = new.shop_id);
  payload jsonb := jsonb_build_object('orderId', new.id);
begin
  if tg_op = 'INSERT' then
    if new.status = 'sent' then
      perform push_to_users(array(select user_id from employees where id = new.manager_id and user_id is not null),
        '🛒 Նոր պատվեր', shop_name, payload);
    end if;
    return new;
  end if;
  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
    perform push_to_users(array(select user_id from employees where id = new.assignee_id and user_id is not null),
      '📦 Ձեզ փոխանցվեց պատվեր', shop_name, payload);
  end if;
  if new.status is distinct from old.status then
    if new.status = 'accepted' then
      perform push_to_users(shop_users, firm_name, 'Մենեջերը ընդունեց պատվերը', payload);
    elsif new.status = 'on_the_way' then
      perform push_to_users(shop_users, firm_name, '🚚 Վարորդը ճանապարհին է', payload);
    elsif new.status = 'delivered' then
      perform push_to_users(shop_users, firm_name, '✅ Պատվերը առաքված է', payload);
    end if;
  end if;
  return new;
end $$;

-- ───────────── 6. Պարտքեր և վճարումներ ─────────────
-- Պարտք = առաքված պատվերների գումար − հաստատված վճարումներ (security invoker → RLS)
create or replace function debts()
returns table (shop_id uuid, firm_id uuid, delivered numeric, paid numeric, pending numeric, debt numeric)
language sql stable security invoker set search_path = public as $$
  with d as (
    select o.shop_id, o.firm_id, sum(coalesce(i.actual_qty, i.qty) * i.price) amt
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
grant execute on function debts() to authenticated;

-- Վճարումը հաստատում է ֆիրմայի ադմինը կամ ներքին աշխատողը (հաշվապահ); խանութը չի կարող հաստատել
create or replace function payments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and is_shop_member(new.shop_id) then
    new.confirmed_at := null;
    new.confirmed_by := null;
    new.marked_paid_by_shop_at := now();
  end if;
  if tg_op = 'UPDATE' then
    new.shop_id := old.shop_id; new.firm_id := old.firm_id;
    if new.confirmed_at is not null and old.confirmed_at is null then
      new.confirmed_by := (select id from employees where user_id = auth.uid() and active limit 1);
      new.confirmed_at := now();
    end if;
  end if;
  return new;
end $$;
revoke execute on function payments_guard() from public, anon, authenticated;
drop trigger if exists payments_guard on payments;
create trigger payments_guard before insert or update on payments for each row execute function payments_guard();

-- Ֆիրմայի աշխատողը կարող է գրանցել ստացված վճարում (օր.՝ փոխանցում, որ խանութը չի նշել)
create policy payments_firm_insert on payments for insert to authenticated with check (
  firm_id = (my_employee()).firm_id and (my_employee()).role in ('admin', 'staff')
);

-- Ֆակտուրայի համարը կարող է գրել ֆիրմայի աշխատողը
grant update (invoice_number) on orders to authenticated;
