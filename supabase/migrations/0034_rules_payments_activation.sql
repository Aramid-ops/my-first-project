-- 2026-11-27 · Ուղղումների փաթեթ (SPEC §28)
--   1. Թույլտվություններ. ով է հաստատում վճարումները (can_confirm_payments), ղեկավարը՝ միայն եթե իրեն նշել է
--   2. Վճարում. եղանակ, չեկի նկար (փակ «receipts» պահոց), «Փոխանցել հաշվապահին», պարտքից ավելի չի կարելի
--   3. Գծեր. մենեջերն էլ է փոխում իր գծերը, հիշեցումը՝ քանի րոպե առաջ (reminder_minutes)
--   4. Ֆիրմայի ակտիվացում բանկային փոխանցմամբ (verified + կոդ)

-- ───────────── 1. Թույլտվություններ ─────────────
alter table firms add column if not exists verified boolean not null default true;          -- հիններն արդեն աշխատում են
alter table employees add column if not exists can_confirm_payments boolean not null default false;
grant update (can_confirm_payments) on employees to authenticated;   -- փոխում է միայն ադմինը (employees_admin_update)

-- Ֆիրմայում ղեկավար կա՞ (եթե ոչ՝ մենեջերը ինքն է ամեն ինչ անում իր խանութների համար)
create or replace function firm_has_admin(f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e join firms x on x.id = e.firm_id
                 where e.firm_id = f and e.role = 'admin' and e.active and e.user_id is not null and x.verified)
$$;

-- Ով կարող է հաստատել «գումարը ստացվել է»
create or replace function can_confirm_payment(f uuid, s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees e
    where e.user_id = (select auth.uid()) and e.active and e.firm_id = f
      and (e.can_confirm_payments
           or (not firm_has_admin(f) and e.role = 'manager'
               and exists (select 1 from shop_firm_links l where l.shop_id = s and l.firm_id = f and l.manager_id = e.id))))
$$;
revoke execute on function firm_has_admin(uuid) from public, anon;
revoke execute on function can_confirm_payment(uuid, uuid) from public, anon;
grant execute on function firm_has_admin(uuid), can_confirm_payment(uuid, uuid) to authenticated;

drop policy if exists payments_confirm on payments;
create policy payments_confirm on payments for update to authenticated using (can_confirm_payment(firm_id, shop_id));

-- ───────────── 2. Վճարում ─────────────
alter table payments add column if not exists receipt_path text;          -- չեկի նկար (փակ պահոց)
alter table payments add column if not exists forwarded_to uuid references employees (id) on delete set null;
create index if not exists payments_forwarded_idx on payments (forwarded_to);
create index if not exists payments_shop_firm_idx on payments (shop_id, firm_id);
alter table payments drop constraint if exists payments_method_check;
update payments set method = 'transfer' where method not in ('transfer', 'cash_driver', 'cash_manager');
alter table payments add constraint payments_method_check check (method in ('transfer', 'cash_driver', 'cash_manager'));

create or replace function payments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare open_debt numeric;
begin
  if tg_op = 'INSERT' and is_shop_member(new.shop_id) then
    new.confirmed_at := null;
    new.confirmed_by := null;
    new.forwarded_to := null;
    new.marked_paid_by_shop_at := now();
    -- պարտքից ավելի (ներառյալ արդեն նշված, չհաստատված վճարումները) չի կարելի
    select coalesce((select debt - pending from debts() d where d.shop_id = new.shop_id and d.firm_id = new.firm_id), 0) into open_debt;
    if new.amount <= 0 or new.amount > open_debt then
      raise exception 'Գումարը չի կարող գերազանցել պարտքը (%)', open_debt;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.shop_id := old.shop_id; new.firm_id := old.firm_id; new.amount := old.amount;
    if new.confirmed_at is not null and old.confirmed_at is null then
      new.confirmed_by := (select id from employees where user_id = auth.uid() and active limit 1);
      new.confirmed_at := now();
    end if;
  end if;
  return new;
end $$;

-- Մենեջերը փոխանցում է վճարումը հաշվապահին (կամ ով հաստատում է)
create or replace function forward_payment(p_payment uuid, p_to uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p payments := (select p from payments p where p.id = p_payment);
begin
  if p.id is null or p.firm_id <> (select (my_employee()).firm_id) then raise exception 'Չի գտնվել'; end if;
  if not exists (select 1 from employees where id = p_to and firm_id = p.firm_id and active) then raise exception 'Աշխատողը չի գտնվել'; end if;
  update payments set forwarded_to = p_to where id = p_payment;
  perform push_to_users(array(select user_id from employees where id = p_to and user_id is not null),
    '💳 Վճարում՝ ' || (select name from shops where id = p.shop_id), trim_scale(p.amount)::text || ' ֏ · հաստատեք, երբ գումարը հասնի',
    jsonb_build_object('paymentId', p.id));
end $$;
revoke execute on function forward_payment(uuid, uuid) from public, anon;
grant execute on function forward_payment(uuid, uuid) to authenticated;

-- Խանութը նշեց «Վճարել եմ» → ծանուցում խանութի մենեջերին և հաստատողներին
create or replace function payments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_to_users(
    array(select e.user_id from employees e where e.firm_id = new.firm_id and e.active and e.user_id is not null
            and (e.can_confirm_payments or e.id = (select manager_id from shop_firm_links where shop_id = new.shop_id and firm_id = new.firm_id))),
    '💳 ' || (select name from shops where id = new.shop_id) || '-ը վճարել է',
    trim_scale(new.amount)::text || ' ֏ · ' || case new.method when 'cash_driver' then 'կանխիկ վարորդին' when 'cash_manager' then 'կանխիկ մենեջերին' else 'փոխանցում' end,
    jsonb_build_object('paymentId', new.id));
  return new;
end $$;
revoke execute on function payments_notify() from public, anon, authenticated;
drop trigger if exists payments_notify on payments;
create trigger payments_notify after insert on payments for each row when (new.marked_paid_by_shop_at is not null) execute function payments_notify();

-- Չեկերի փակ պահոց. <shop_id>/... ; տեսնում են խանութը և այն ֆիրման, որին վճարել է
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;
drop policy if exists receipts_upload on storage.objects;
create policy receipts_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'receipts' and is_shop_member(((storage.foldername(name))[1])::uuid));
drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects for select to authenticated using (
  bucket_id = 'receipts' and (is_shop_member(((storage.foldername(name))[1])::uuid)
    or exists (select 1 from public.payments p where p.receipt_path = name and p.firm_id = (select (public.my_employee()).firm_id))));

-- ───────────── 3. Գծեր ─────────────
alter table lines add column if not exists reminder_minutes int default 60 check (reminder_minutes is null or reminder_minutes between 10 and 600);
-- Մենեջերը փոխում է այն գծերը, որտեղ իր խանութներն են (կամ ամբողջը, եթե ֆիրման ղեկավար չունի)
drop policy if exists lines_manager on lines;
create policy lines_manager on lines for update to authenticated using (
  firm_id = (select (my_employee()).firm_id) and (select (my_employee()).role) = 'manager'
  and (not firm_has_admin(firm_id)
       or exists (select 1 from shop_firm_links l where l.line_id = lines.id and l.manager_id = (select (my_employee()).id))))
  with check (firm_id = (select (my_employee()).firm_id));
drop policy if exists lines_unclaimed on lines;
create policy lines_unclaimed on lines for all to authenticated using (can_manage_firm(firm_id) and not firm_has_admin(firm_id))
  with check (can_manage_firm(firm_id) and not firm_has_admin(firm_id));

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
    where l.status = 'active' and ln.order_cutoff is not null and ln.reminder_minutes is not null
      and (cardinality(ln.delivery_days) = 0 or tomorrow = any(ln.delivery_days))
      and now_am::time between ln.order_cutoff - make_interval(mins => ln.reminder_minutes) and ln.order_cutoff
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

-- ───────────── 4. Ֆիրմայի ակտիվացում բանկային փոխանցմամբ ─────────────
alter table firms add column if not exists verification_code text;
alter table firms add column if not exists verification_paid_at timestamptz;
alter table firm_claims add column if not exists verification_code text default 'MTK-' || lpad((floor(random() * 10000))::int::text, 4, '0');
alter table firm_claims add column if not exists paid_at timestamptz;

create or replace function firms_verification_code() returns trigger
language plpgsql set search_path = public as $$
begin
  if not new.verified and new.verification_code is null then
    new.verification_code := 'MTK-' || lpad((floor(random() * 10000))::int::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists firms_verification_code on firms;
create trigger firms_verification_code before insert on firms for each row execute function firms_verification_code();

-- Ադմինի գործիքները աշխատում են միայն ստուգված ֆիրմայում
create or replace function is_firm_admin(f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e join firms x on x.id = e.firm_id
                 where e.user_id = (select auth.uid()) and e.active and e.role = 'admin' and e.firm_id = f and x.verified)
$$;

-- Ղեկավարը նշում է «Վճարել եմ» (նոր ֆիրմա կամ սեփականացման հայտ) → մենք ստուգում ենք քաղվածքը
create or replace function mark_verification_paid() returns void
language plpgsql security definer set search_path = public as $$
declare me employees := my_employee();
begin
  if me.role = 'admin' then
    update firms set verification_paid_at = now() where id = me.firm_id and not verified;
  else
    update firm_claims set paid_at = now() where user_id = (select auth.uid()) and status = 'pending';
  end if;
  perform push_to_users(array(select user_id from platform_admins), '🏦 Ստուգեք փոխանցումը', 'Ֆիրմայի ակտիվացում', '{}'::jsonb);
end $$;
revoke execute on function mark_verification_paid() from public, anon;
grant execute on function mark_verification_paid() to authenticated;

create or replace function pending_firm_activations()
returns table (firm_id uuid, firm_name text, tax_id text, code text, paid_at timestamptz, email text)
language sql stable security definer set search_path = public as $$
  select f.id, f.name, f.tax_id, f.verification_code, f.verification_paid_at, u.email
  from firms f join employees e on e.firm_id = f.id and e.role = 'admin' join auth.users u on u.id = e.user_id
  where not f.verified and exists (select 1 from platform_admins where user_id = (select auth.uid()))
  order by f.verification_paid_at nulls last
$$;
revoke execute on function pending_firm_activations() from public, anon;
grant execute on function pending_firm_activations() to authenticated;

create or replace function decide_firm_activation(p_firm uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from platform_admins where user_id = (select auth.uid())) then raise exception 'Միայն հարթակի ադմինը'; end if;
  if p_approve then
    update firms set verified = true where id = p_firm;
    perform push_to_users(array(select user_id from employees where firm_id = p_firm and role = 'admin' and user_id is not null),
      '✅ Ֆիրման ակտիվացված է', 'Բոլոր գործիքները բաց են', '{}'::jsonb);
  else
    update firms set verification_paid_at = null where id = p_firm;
  end if;
end $$;
revoke execute on function decide_firm_activation(uuid, boolean) from public, anon;
grant execute on function decide_firm_activation(uuid, boolean) to authenticated;

drop function if exists pending_claims();
create function pending_claims()
returns table (id uuid, firm_name text, data jsonb, email text, created_at timestamptz, code text, paid_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, f.name, c.data, u.email, c.created_at, c.verification_code, c.paid_at
  from firm_claims c join firms f on f.id = c.firm_id join auth.users u on u.id = c.user_id
  where c.status = 'pending' and exists (select 1 from platform_admins where user_id = (select auth.uid()))
  order by c.paid_at nulls last, c.created_at
$$;
revoke execute on function pending_claims() from public, anon;
grant execute on function pending_claims() to authenticated;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  k text := m->>'kind';
  sid uuid;
  fid uuid;
begin
  if k = 'shop' and coalesce(m->>'name', '') <> '' then
    insert into shops (name, legal_name, tax_id, city, district, address, phone, email, contact_person, lat, lng)
    values (m->>'name', m->>'legal_name', coalesce(m->>'tax_id', ''), coalesce(m->>'city', 'Երևան'),
            m->>'district', m->>'address', m->>'phone', coalesce(m->>'email', new.email), m->>'contact_person',
            nullif(m->>'lat', '')::double precision, nullif(m->>'lng', '')::double precision)
    returning id into sid;
    insert into shop_members (shop_id, user_id) values (sid, new.id);

  elsif k = 'manager' and coalesce(m->>'name', '') <> '' then
    fid := nullif(m->>'firm_id', '')::uuid;
    if fid is null or not exists (select 1 from firms where id = fid) then
      insert into firms (name, category, status) values (coalesce(nullif(m->>'firm_name', ''), m->>'name'), m->>'category', 'unclaimed')
      returning id into fid;
    end if;
    insert into employees (firm_id, user_id, name, role, phone) values (fid, new.id, m->>'name', 'manager', m->>'phone');

  elsif k = 'firm' and coalesce(m->>'firm_name', '') <> '' then
    fid := nullif(m->>'firm_id', '')::uuid;
    if fid is not null and exists (select 1 from firms where id = fid and status = 'unclaimed') then
      insert into firm_claims (firm_id, user_id, data) values (fid, new.id, m);
    else
      -- Նոր ֆիրման աշխատում է միայն բանկային փոխանցմամբ ստուգվելուց հետո (verified)
      insert into firms (name, legal_name, tax_id, address, category, status, verified)
      values (m->>'firm_name', m->>'legal_name', m->>'tax_id', m->>'address', m->>'category', 'active', false)
      returning id into fid;
      insert into employees (firm_id, user_id, name, role, phone) values (fid, new.id, coalesce(m->>'name', 'Ղեկավար'), 'admin', m->>'phone');
    end if;

  elsif k = 'driver' and coalesce(m->>'name', '') <> '' then
    insert into driver_profiles (user_id, name, phone, address, license_categories, vehicle_type, vehicle_model, plate, capacity_kg, refrigerated)
    values (new.id, m->>'name', m->>'phone', m->>'address',
            coalesce(array(select jsonb_array_elements_text(m->'license_categories')), '{}'),
            m->>'vehicle_type', m->>'vehicle_model', m->>'plate', nullif(m->>'capacity_kg', '')::numeric,
            coalesce((m->>'refrigerated')::boolean, false));

  elsif k = 'employee' and coalesce(m->>'code', '') <> '' then
    update employees set user_id = new.id, invite_code = null where invite_code = m->>'code' and user_id is null;
  end if;
  return new;
end $$;

