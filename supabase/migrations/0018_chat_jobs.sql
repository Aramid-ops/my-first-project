-- Չաթ և աշխատանքի հրավեր (SPEC §18)
--
-- Չաթ՝ միայն նրանց միջև, ովքեր կապ ունեն.
--   · նույն ֆիրմայի աշխատողներ (ղեկավար, մենեջեր, օֆիս, վարորդ)
--   · խանութ ↔ իր մատակարարի (ֆիրմայի) աշխատողներ
--   · ֆիրմայի ղեկավար / մենեջեր / օֆիս ↔ «Փնտրում եմ աշխատանք» վարորդ
--   · աշխատանքի հրավերի կողմերը

-- ───────────── Վարորդներ, որոնք փնտրում են աշխատանք ─────────────
alter table driver_profiles add column if not exists looking_for_work boolean not null default true;
alter table driver_profiles add column if not exists district text;

-- Ֆիրմայի աշխատողների համար. ազատ վարորդների ցուցակ
create or replace function available_drivers()
returns table (user_id uuid, name text, phone text, license_categories text[], vehicle_type text, vehicle_model text, capacity_kg numeric, refrigerated boolean, district text)
language sql stable security definer set search_path = public as $$
  select d.user_id, d.name, d.phone, d.license_categories, d.vehicle_type, d.vehicle_model, d.capacity_kg, d.refrigerated, d.district
  from driver_profiles d
  where d.looking_for_work
    and not exists (select 1 from employees e where e.user_id = d.user_id and e.active)
    and exists (select 1 from employees me where me.user_id = auth.uid() and me.active and me.role in ('admin', 'manager', 'staff'))
  order by d.created_at desc
$$;
grant execute on function available_drivers() to authenticated;

-- ───────────── Աշխատանքի հրավեր մեկ սեղմումով ─────────────
create table if not exists job_invites (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,   -- ում են հրավիրում
  role employee_role not null,
  department text,
  invited_by uuid references employees(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);
alter table job_invites enable row level security;
create policy job_invites_read on job_invites for select to authenticated using (user_id = auth.uid() or firm_id = (my_employee()).firm_id);
grant select on job_invites to authenticated;

create or replace function invite_user(p_user uuid, p_role employee_role, p_department text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  me employees := (select e from employees e where e.user_id = auth.uid() and e.active limit 1);
begin
  if me.id is null or me.role not in ('admin', 'manager') then raise exception 'Միայն ղեկավարը կամ մենեջերը'; end if;
  if p_role = 'admin' then raise exception 'Ղեկավար հրավիրել հնարավոր չէ'; end if;
  if me.role = 'manager' and p_role <> 'driver' then raise exception 'Մենեջերը կարող է հրավիրել միայն վարորդ'; end if;
  if exists (select 1 from employees where user_id = p_user and active) then raise exception 'Այս մարդը արդեն ֆիրմայի աշխատող է'; end if;
  insert into job_invites (firm_id, user_id, role, department, invited_by) values (me.firm_id, p_user, p_role, nullif(p_department, ''), me.id);
  perform push_to_users(array[p_user], (select name from firms where id = me.firm_id), '📩 Հրավեր աշխատանքի', jsonb_build_object('jobInvite', true));
end $$;
grant execute on function invite_user(uuid, employee_role, text) to authenticated;

create or replace function answer_job_invite(p_invite uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  j job_invites;
  dname text;
  dphone text;
begin
  select * into j from job_invites where id = p_invite and user_id = auth.uid() and status = 'pending';
  if j.id is null then raise exception 'Հրավերը չի գտնվել'; end if;
  if p_accept then
    if exists (select 1 from employees where user_id = auth.uid() and active) then raise exception 'Դուք արդեն ֆիրմայի աշխատող եք'; end if;
    select name, phone into dname, dphone from driver_profiles where user_id = auth.uid();
    insert into employees (firm_id, user_id, name, role, department, phone)
      values (j.firm_id, auth.uid(), coalesce(dname, 'Աշխատող'), j.role, j.department, dphone);
    update job_invites set status = 'declined' where user_id = auth.uid() and status = 'pending' and id <> j.id;
  end if;
  update job_invites set status = case when p_accept then 'accepted' else 'declined' end where id = j.id;
  perform push_to_users(array(select user_id from employees where id = j.invited_by and user_id is not null),
    coalesce(dname, 'Աշխատող'), case when p_accept then '✅ Ընդունեց հրավերը' else 'Մերժեց հրավերը' end, '{}'::jsonb);
  return (select name from firms where id = j.firm_id);
end $$;
grant execute on function answer_job_invite(uuid, boolean) to authenticated;

-- ───────────── Ում հետ կարող եմ գրել ─────────────
-- Վերադարձնում է կոնտակտներ. user_id, անուն, ինչ դերում է (ենթավերնագիր)
create or replace function my_contacts()
returns table (user_id uuid, name text, subtitle text)
language sql stable security definer set search_path = public as $$
  with me_emp as (select * from employees where user_id = auth.uid() and active limit 1),
       me_shop as (select shop_id from shop_members where user_id = auth.uid())
  -- 1. նույն ֆիրմայի աշխատողներ
  select e.user_id, e.name, coalesce(e.department, case e.role when 'admin' then 'ղեկավար' when 'manager' then 'մենեջեր' when 'driver' then 'վարորդ' else 'աշխատող' end)
    from employees e, me_emp m where e.firm_id = m.firm_id and e.user_id is not null and e.user_id <> auth.uid() and e.active
  union
  -- 2. խանութ → իր մատակարարների աշխատողները (մենեջեր, ղեկավար, օֆիս)
  select e.user_id, e.name, f.name || ' · ' || case e.role when 'admin' then 'ղեկավար' when 'manager' then 'մենեջեր' else coalesce(e.department, 'աշխատող') end
    from me_shop s join shop_firm_links l on l.shop_id = s.shop_id and l.status in ('active', 'pending')
    join employees e on e.firm_id = l.firm_id and e.active and e.user_id is not null and e.role in ('admin', 'manager', 'staff')
    join firms f on f.id = l.firm_id
  union
  -- 3. ֆիրմայի աշխատող → ֆիրմայի խանութները (մենեջեր՝ իր խանութները, մյուսները՝ բոլորը)
  select sm.user_id, s.name, 'խանութ'
    from me_emp m join shop_firm_links l on l.firm_id = m.firm_id and l.status in ('active', 'pending')
      and (m.role <> 'manager' or l.manager_id = m.id or l.manager_id is null)
    join shops s on s.id = l.shop_id join shop_members sm on sm.shop_id = s.id
    where m.role <> 'driver'
  union
  -- 4. վարորդ → այն խանութները, որոնց հիմա տանում է
  select sm.user_id, s.name, 'խանութ'
    from me_emp m join orders o on o.driver_id = m.id and o.status in ('preparing', 'on_the_way')
    join shops s on s.id = o.shop_id join shop_members sm on sm.shop_id = s.id
    where m.role = 'driver'
  union
  -- 5. աշխատանքի հրավերի կողմերը
  select e.user_id, e.name, f.name || ' · հրավեր'
    from job_invites j join employees e on e.id = j.invited_by join firms f on f.id = j.firm_id
    where j.user_id = auth.uid() and e.user_id is not null
  union
  select d.user_id, d.name, 'վարորդ · հրավիրված'
    from me_emp m join job_invites j on j.firm_id = m.firm_id join driver_profiles d on d.user_id = j.user_id
$$;
grant execute on function my_contacts() to authenticated;

create or replace function can_chat(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from my_contacts() c where c.user_id = other)
    or exists (select 1 from available_drivers() d where d.user_id = other)   -- ֆիրման կարող է գրել ազատ վարորդին
$$;
grant execute on function can_chat(uuid) to authenticated;

-- ───────────── Չաթ ─────────────
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references auth.users(id) on delete cascade,
  b uuid not null references auth.users(id) on delete cascade,
  a_name text, b_name text,                 -- անունները՝ ցույց տալու համար
  last_at timestamptz not null default now(),
  last_text text,
  check (a < b),
  unique (a, b)
);
create table if not exists messages (
  id bigserial primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender uuid not null references auth.users(id) on delete cascade,
  body text,
  photo_url text,
  order_id uuid references orders(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (coalesce(body, '') <> '' or photo_url is not null)
);
create index if not exists messages_conv on messages (conversation_id, created_at);

alter table conversations enable row level security;
alter table messages enable row level security;
create policy conversations_read on conversations for select to authenticated using (auth.uid() in (a, b));
create policy messages_read on messages for select to authenticated using (
  exists (select 1 from conversations c where c.id = conversation_id and auth.uid() in (c.a, c.b)));
create policy messages_send on messages for insert to authenticated with check (
  sender = auth.uid() and exists (select 1 from conversations c where c.id = conversation_id and auth.uid() in (c.a, c.b)));
create policy messages_mark_read on messages for update to authenticated using (
  sender <> auth.uid() and exists (select 1 from conversations c where c.id = conversation_id and auth.uid() in (c.a, c.b)));
grant select on conversations to authenticated;
grant select, insert on messages to authenticated;
grant update (read_at) on messages to authenticated;
grant usage, select on sequence messages_id_seq to authenticated;

-- Իմ անունը՝ ինչպես երևում է ուրիշներին
create or replace function my_display_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select e.name || ' · ' || f.name from employees e join firms f on f.id = e.firm_id where e.user_id = auth.uid() and e.active limit 1),
    (select s.name from shop_members m join shops s on s.id = m.shop_id where m.user_id = auth.uid() limit 1),
    (select name || ' · վարորդ' from driver_profiles where user_id = auth.uid()),
    (select email from auth.users where id = auth.uid()))
$$;

-- Բացել (կամ ստեղծել) զրույց
create or replace function open_chat(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  x uuid := least(auth.uid(), other);
  y uuid := greatest(auth.uid(), other);
  cid uuid;
  other_name text;
begin
  if other = auth.uid() then raise exception 'Չի կարելի գրել ինքներդ ձեզ'; end if;
  select id into cid from conversations where a = x and b = y;
  if cid is not null then return cid; end if;
  if not can_chat(other) then raise exception 'Դուք կապ չունեք այս մարդու հետ'; end if;
  select coalesce((select c.name || coalesce(' · ' || c.subtitle, '') from my_contacts() c where c.user_id = other limit 1),
                  (select name || ' · վարորդ' from driver_profiles where user_id = other)) into other_name;
  insert into conversations (a, b, a_name, b_name)
    values (x, y,
            case when x = auth.uid() then my_display_name() else other_name end,
            case when y = auth.uid() then my_display_name() else other_name end)
    returning id into cid;
  return cid;
end $$;
grant execute on function open_chat(uuid) to authenticated;

-- Նոր հաղորդագրություն → զրույցի ամփոփում + ծանուցում ստացողին
create or replace function messages_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c conversations := (select c from conversations c where c.id = new.conversation_id);
  receiver uuid := case when new.sender = c.a then c.b else c.a end;
  sender_name text := case when new.sender = c.a then c.a_name else c.b_name end;
begin
  update conversations set last_at = new.created_at, last_text = coalesce(nullif(new.body, ''), '📷 Լուսանկար') where id = c.id;
  perform push_to_users(array[receiver], coalesce(sender_name, 'Նոր հաղորդագրություն'), coalesce(nullif(new.body, ''), '📷 Լուսանկար'), jsonb_build_object('chatId', c.id));
  return new;
end $$;
revoke execute on function messages_after() from public, anon, authenticated;
drop trigger if exists messages_after on messages;
create trigger messages_after after insert on messages for each row execute function messages_after();

alter publication supabase_realtime add table messages;
