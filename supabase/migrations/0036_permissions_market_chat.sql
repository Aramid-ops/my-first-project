-- 2026-11-27 · SPEC §29
--   1. Թույլտվություններ (🔐). լռելյայն մենեջերներն ու աշխատողները շատ բան կարող են, ղեկավարը փակում/բացում է՝
--      խմբի (դեր / բաժին) կամ կոնկրետ մարդու համար
--   2. Սև ցուցակ. խանութը չի կարող պատվիրել (միայն վճարել)
--   3. «🤝 Առաջարկել համագործակցություն» (ֆիրմա → խանութ)
--   4. Live շուկա. քանակ և միավոր; առաջարկ / «Հետաքրքրված եմ» → անձնական չաթ
--   5. Գծեր. ստեղծել, անունը փոխել, ջնջել (թույլտվությամբ)

-- ───────────── 1. Թույլտվություններ ─────────────
-- target: 'role:manager' | 'role:staff' | 'dept:<բաժին>' | 'emp:<employee_id>'
-- perm:   shops_new · shop_terms · blacklist · lines · products · invite · payments_view · payments_confirm
create table if not exists firm_perms (
  firm_id uuid not null references firms (id) on delete cascade,
  target text not null,
  perm text not null check (perm in ('shops_new', 'shop_terms', 'blacklist', 'lines', 'products', 'invite', 'payments_view', 'payments_confirm')),
  allowed boolean not null,
  primary key (firm_id, target, perm)
);
alter table firm_perms enable row level security;
create policy firm_perms_read on firm_perms for select to authenticated using (firm_id = (select (my_employee()).firm_id));
create policy firm_perms_write on firm_perms for all to authenticated using (is_firm_admin(firm_id)) with check (is_firm_admin(firm_id));
grant select, insert, update, delete on firm_perms to authenticated;

-- Լռելյայն արժեքները (եթե ղեկավարը ոչինչ չի նշել)
create or replace function default_perm(r employee_role, p text) returns boolean
language sql immutable set search_path = public as $$
  select case r
    when 'manager' then p in ('shops_new', 'shop_terms', 'lines', 'payments_view')
    when 'staff' then p in ('shops_new', 'shop_terms', 'lines', 'products', 'payments_view')
    else false end
$$;

-- Ունի՞ արդյոք ներկա օգտատերը թույլտվությունը f ֆիրմայում։ Մարդ → բաժին → դեր → լռելյայն
create or replace function has_perm(p text, f uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me employees := (select e from employees e where e.user_id = (select auth.uid()) and e.active and e.firm_id = f limit 1);
begin
  if me.id is null then return false; end if;
  -- ղեկավարը ամեն ինչ կարող է, բացի վճարումների վերջնական հաստատումից (միայն եթե իրեն էլ է նշել)
  if me.role = 'admin' and p <> 'payments_confirm' then return true; end if;
  -- ղեկավար չունեցող ֆիրմայում մենեջերն ու աշխատողը ամեն ինչ կարող են
  if me.role in ('manager', 'staff') and not firm_has_admin(f) then return true; end if;
  return coalesce(
    (select allowed from firm_perms where firm_id = f and target = 'emp:' || me.id and perm = p),
    (select allowed from firm_perms where firm_id = f and me.department is not null and target = 'dept:' || me.department and perm = p),
    (select allowed from firm_perms where firm_id = f and target = 'role:' || me.role and perm = p),
    default_perm(me.role, p));
end $$;
revoke execute on function has_perm(text, uuid), default_perm(employee_role, text) from public, anon;
grant execute on function has_perm(text, uuid) to authenticated;

-- Էկրանի համար. իմ թույլտվությունների ցուցակը
create or replace function my_permissions() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p), '{}') from unnest(array['shops_new', 'shop_terms', 'blacklist', 'lines', 'products', 'invite', 'payments_view', 'payments_confirm']) p
  where has_perm(p, (select (my_employee()).firm_id))
$$;
revoke execute on function my_permissions() from public, anon;
grant execute on function my_permissions() to authenticated;

-- Նախկին «💳 Հաստատում է վճարումներ» նշումները → անհատական թույլտվություն
insert into firm_perms (firm_id, target, perm, allowed)
  select firm_id, 'emp:' || id, 'payments_confirm', true from employees where can_confirm_payments
  on conflict do nothing;

create or replace function can_confirm_payment(f uuid, s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm('payments_confirm', f) or exists (
    select 1 from employees e
    where e.user_id = (select auth.uid()) and e.active and e.firm_id = f and e.role = 'manager' and not firm_has_admin(f)
      and exists (select 1 from shop_firm_links l where l.shop_id = s and l.firm_id = f and l.manager_id = e.id))
$$;

-- Ապրանքներ
create or replace function can_manage_firm(f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_firm_admin(f) or has_perm('products', f)
$$;

-- Աշխատողների հրավեր
create or replace function invite_employee(p_name text, p_role employee_role, p_department text default null, p_phone text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  me employees := (select e from employees e where e.user_id = auth.uid() and e.active limit 1);
  code text;
begin
  if me.id is null or not has_perm('invite', me.firm_id) then raise exception 'Թույլտվություն չունեք'; end if;
  if p_role = 'admin' then raise exception 'Ղեկավար ավելացնել հնարավոր չէ այստեղից'; end if;
  loop
    code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from employees where invite_code = code);
  end loop;
  insert into employees (firm_id, name, role, department, phone, invite_code)
    values (me.firm_id, p_name, p_role, nullif(p_department, ''), nullif(p_phone, ''), code);
  return code;
end $$;

-- Գծեր. ստեղծել / փոխել / ջնջել՝ «lines» թույլտվությամբ
drop policy if exists lines_admin on lines;
drop policy if exists lines_manager on lines;
drop policy if exists lines_unclaimed on lines;
drop policy if exists lines_write on lines;
create policy lines_write on lines for all to authenticated
  using (firm_id = (select (my_employee()).firm_id) and has_perm('lines', firm_id))
  with check (firm_id = (select (my_employee()).firm_id) and has_perm('lines', firm_id));
grant insert, update, delete on lines to authenticated;

-- ───────────── 2. Սև ցուցակ + 3. Համագործակցության առաջարկ ─────────────
alter table shop_firm_links add column if not exists blocked boolean not null default false;
alter table shop_firm_links add column if not exists blocked_reason text;            -- տեսնում է միայն ֆիրման
alter table shop_firm_links add column if not exists initiated_by text not null default 'shop' check (initiated_by in ('shop', 'firm'));

-- Ով ինչ կարող է փոխել խանութի կապում (մնացածը վերադարձվում է հին արժեքին)
create or replace function links_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare me employees := my_employee();
begin
  new.shop_id := old.shop_id;
  new.firm_id := old.firm_id;
  new.initiated_by := old.initiated_by;
  -- խանութը միայն ընդունում է ֆիրմայի առաջարկը (answer_partnership-ով, որ դնում է app.partnership դրոշը)
  if current_setting('app.partnership', true) = 'on' or (select auth.uid()) is null then return new; end if;  -- + սերվերային ադմին գործողություններ
  if me.id is null then return old; end if;
  if not is_firm_admin(old.firm_id) then
    -- հայտի ընդունում (մենեջերը՝ իր վրա)
    if not (old.status = 'pending' and new.status = 'active' and has_perm('shops_new', old.firm_id)
            and (new.manager_id = me.id or me.role <> 'manager')) then
      new.status := old.status;
      new.manager_id := old.manager_id;
    end if;
    if not has_perm('shop_terms', old.firm_id) then
      new.discount_pct := old.discount_pct;
      new.credit_limit := old.credit_limit;
    end if;
    if not has_perm('blacklist', old.firm_id) then
      new.blocked := old.blocked;
      new.blocked_reason := old.blocked_reason;
    end if;
    if not has_perm('lines', old.firm_id) and not has_perm('shop_terms', old.firm_id) then
      new.line_id := old.line_id;
    end if;
  end if;
  if new.line_id is not null and not exists (select 1 from lines where id = new.line_id and firm_id = old.firm_id) then
    raise exception 'Գիծը չի պատկանում այս ֆիրմային';
  end if;
  return new;
end $$;

drop policy if exists links_update on shop_firm_links;
create policy links_update on shop_firm_links for update to authenticated using (
  firm_id = (select (my_employee()).firm_id)
  and (is_firm_admin(firm_id) or manager_id = (select (my_employee()).id) or (select (my_employee()).role) = 'staff' or status = 'pending')
) with check (firm_id = (select (my_employee()).firm_id));

-- Սև ցուցակում գտնվող խանութը չի կարող պատվեր ուղարկել
create or replace function orders_block_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from shop_firm_links where shop_id = new.shop_id and firm_id = new.firm_id and blocked) then
    raise exception 'Այս մատակարարից պատվերը ժամանակավորապես անհասանելի է. կապվեք մենեջերի հետ';
  end if;
  return new;
end $$;
revoke execute on function orders_block_check() from public, anon, authenticated;
drop trigger if exists orders_block_check on orders;
create trigger orders_block_check before insert on orders for each row execute function orders_block_check();

-- Ֆիրման առաջարկում է համագործակցություն խանութին
create or replace function offer_partnership(p_shop uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me employees := my_employee();
begin
  if me.id is null or not has_perm('shops_new', me.firm_id) then raise exception 'Թույլտվություն չունեք'; end if;
  if not exists (select 1 from shops where id = p_shop and listed) then raise exception 'Խանութը չի գտնվել'; end if;
  if exists (select 1 from shop_firm_links where shop_id = p_shop and firm_id = me.firm_id) then raise exception 'Արդեն կապ կա այս խանութի հետ'; end if;
  insert into shop_firm_links (shop_id, firm_id, manager_id, status, initiated_by)
    values (p_shop, me.firm_id,
            case when me.role = 'manager' then me.id else district_manager(me.firm_id, (select district from shops where id = p_shop)) end,
            'pending', 'firm');
  perform push_to_users(array(select user_id from shop_members where shop_id = p_shop),
    '🤝 ' || (select name from firms where id = me.firm_id), 'Ցանկանում է լինել ձեր մատակարարը', jsonb_build_object('firmId', me.firm_id));
end $$;

-- Խանութը պատասխանում է առաջարկին
create or replace function answer_partnership(p_firm uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := (select shop_id from shop_members where user_id = (select auth.uid()) limit 1);
begin
  if p_accept then
    perform set_config('app.partnership', 'on', true);
    update shop_firm_links set status = 'active' where shop_id = sid and firm_id = p_firm and status = 'pending' and initiated_by = 'firm';
    perform push_to_users(
      array(select e.user_id from employees e join shop_firm_links l on l.firm_id = e.firm_id and l.shop_id = sid
            where e.firm_id = p_firm and e.user_id is not null and (e.id = l.manager_id or e.role = 'admin')),
      '✅ ' || (select name from shops where id = sid), 'Ընդունեց համագործակցությունը', jsonb_build_object('shopId', sid));
    perform set_config('app.partnership', 'off', true);
  else
    delete from shop_firm_links where shop_id = sid and firm_id = p_firm and status = 'pending' and initiated_by = 'firm';
  end if;
end $$;
revoke execute on function offer_partnership(uuid), answer_partnership(uuid, boolean) from public, anon;
grant execute on function offer_partnership(uuid), answer_partnership(uuid, boolean) to authenticated;

-- ───────────── 4. Live շուկա. քանակ / միավոր, առաջարկ → անձնական չաթ ─────────────
alter table supply_requests add column if not exists qty numeric(12, 3) check (qty > 0);
alter table supply_requests add column if not exists unit text check (length(unit) <= 10);
alter table supplier_deals add column if not exists qty numeric(12, 3) check (qty > 0);
alter table supplier_deals add column if not exists unit text check (length(unit) <= 10);

-- Երկու մարդու զրույցը (ստեղծում է, եթե չկա) և հաղորդագրություն
create or replace function chat_post(from_user uuid, to_user uuid, from_name text, to_name text, body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  x uuid := least(from_user, to_user);
  y uuid := greatest(from_user, to_user);
  cid uuid;
begin
  if from_user is null or to_user is null or from_user = to_user then return null; end if;
  select id into cid from conversations where a = x and b = y;
  if cid is null then
    insert into conversations (a, b, a_name, b_name)
      values (x, y, case when x = from_user then from_name else to_name end, case when y = from_user then from_name else to_name end)
      returning id into cid;
  end if;
  insert into messages (conversation_id, sender, body) values (cid, from_user, body);
  return cid;
end $$;
revoke execute on function chat_post(uuid, uuid, text, text, text) from public, anon, authenticated;

-- Մատակարարի առաջարկը խանութի հարցմանը → անձնական չաթ
create or replace function supply_offers_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r supply_requests := (select r from supply_requests r where r.id = new.request_id);
  e employees := (select e from employees e where e.id = new.employee_id);
begin
  perform chat_post(e.user_id, (select user_id from shop_members where shop_id = r.shop_id limit 1),
    e.name || ' · ' || (select name from firms where id = new.firm_id), (select name from shops where id = r.shop_id),
    '💼 Առաջարկ ձեր «' || r.text || '» հարցմանը. ' || new.text || coalesce(' · ' || trim_scale(new.price)::text || ' ֏', ''));
  return new;
end $$;
revoke execute on function supply_offers_chat() from public, anon, authenticated;
drop trigger if exists supply_offers_chat on supply_offers;
create trigger supply_offers_chat after insert on supply_offers for each row execute function supply_offers_chat();

-- «Հետաքրքրված եմ» մատակարարի առաջարկով → անձնական չաթ
create or replace function deal_interests_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d supplier_deals := (select d from supplier_deals d where d.id = new.deal_id);
  e employees := (select e from employees e where e.id = d.employee_id);
begin
  perform chat_post((select user_id from shop_members where shop_id = new.shop_id limit 1), e.user_id,
    (select name from shops where id = new.shop_id), e.name || ' · ' || (select name from firms where id = d.firm_id),
    '🙋 Հետաքրքրված եմ ձեր առաջարկով. «' || d.text || '»');
  return new;
end $$;
revoke execute on function deal_interests_chat() from public, anon, authenticated;
drop trigger if exists deal_interests_chat on deal_interests;
create trigger deal_interests_chat after insert on deal_interests for each row execute function deal_interests_chat();

-- live_requests / live_deals՝ քանակով և միավորով
drop function if exists live_requests();
create function live_requests()
returns table (id uuid, text text, category text, price_hint numeric, created_at timestamptz,
               shop_name text, district text, phone text, mine boolean, my_offer text, offers int, qty numeric, unit text, blocked boolean)
language sql stable security definer set search_path = public as $$
  with me as (select (select e.firm_id from employees e where e.user_id = (select auth.uid()) and e.active limit 1) as firm_id,
                     (select m.shop_id from shop_members m where m.user_id = (select auth.uid()) limit 1) as shop_id)
  select r.id, r.text, r.category, r.price_hint, r.created_at,
    case when me.firm_id is not null or r.shop_id = me.shop_id then s.name end,
    s.district,
    case when me.firm_id is not null and s.listed then s.phone end,
    r.shop_id = me.shop_id,
    (select o.text from supply_offers o where o.request_id = r.id and o.firm_id = me.firm_id),
    (select count(*)::int from supply_offers o where o.request_id = r.id),
    r.qty, r.unit,
    exists (select 1 from shop_firm_links l where l.shop_id = r.shop_id and l.firm_id = me.firm_id and l.blocked)
  from supply_requests r join shops s on s.id = r.shop_id cross join me
  where r.status = 'open' and r.created_at > now() - interval '30 days' and (select auth.uid()) is not null
  order by r.created_at desc
  limit 200
$$;
revoke execute on function live_requests() from public, anon;
grant execute on function live_requests() to authenticated;

drop function if exists live_deals();
create function live_deals()
returns table (id uuid, firm_id uuid, firm_name text, firm_logo text, text text, category text, price numeric,
               created_at timestamptz, employee_name text, phone text, mine boolean, interested boolean, interests int, qty numeric, unit text)
language sql stable security definer set search_path = public as $$
  with me as (select (select e.firm_id from employees e where e.user_id = (select auth.uid()) and e.active limit 1) as firm_id,
                     (select m.shop_id from shop_members m where m.user_id = (select auth.uid()) limit 1) as shop_id)
  select d.id, d.firm_id, f.name, f.logo_url, d.text, d.category, d.price, d.created_at,
    e.name, coalesce(e.phone, f.phone),
    d.firm_id = me.firm_id,
    exists (select 1 from deal_interests i where i.deal_id = d.id and i.shop_id = me.shop_id),
    case when d.firm_id = me.firm_id then (select count(*)::int from deal_interests i where i.deal_id = d.id) end,
    d.qty, d.unit
  from supplier_deals d join firms f on f.id = d.firm_id left join employees e on e.id = d.employee_id cross join me
  where d.status = 'open' and d.created_at > now() - interval '30 days' and (select auth.uid()) is not null
  order by d.created_at desc
  limit 200
$$;
revoke execute on function live_deals() from public, anon;
grant execute on function live_deals() to authenticated;
