-- Անկախ վարորդ և հրավերի կոդ ցանկացած հաշվի համար (SPEC §4.3.3)

-- ───────────── Անկախ վարորդի պրոֆիլ ─────────────
create table if not exists driver_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  license_categories text[] not null default '{}',   -- B, C1, C, CE, D...
  vehicle_type text,                                 -- car / van / truck
  vehicle_model text,
  plate text,
  capacity_kg numeric(9,0),                          -- բեռնատարողություն
  refrigerated boolean not null default false,       -- սառնարանային
  created_at timestamptz not null default now()
);
alter table driver_profiles enable row level security;
create policy driver_profiles_own on driver_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Ֆիրման տեսնում է իր վարորդների պրոֆիլը (մեքենա, բեռնատարողություն)
create policy driver_profiles_firm on driver_profiles for select to authenticated using (
  exists (select 1 from employees e where e.user_id = driver_profiles.user_id and e.firm_id = (my_employee()).firm_id)
);
grant select, insert, update on driver_profiles to authenticated;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  k text := m->>'kind';
  sid uuid;
  fid uuid;
begin
  if k = 'shop' and coalesce(m->>'name', '') <> '' then
    insert into shops (name, legal_name, tax_id, city, district, address, phone, email, contact_person)
    values (m->>'name', m->>'legal_name', coalesce(m->>'tax_id', ''), coalesce(m->>'city', 'Երևան'),
            m->>'district', m->>'address', m->>'phone', coalesce(m->>'email', new.email), m->>'contact_person')
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
      insert into firms (name, legal_name, tax_id, address, category, status)
      values (m->>'firm_name', m->>'legal_name', m->>'tax_id', m->>'address', m->>'category', 'active')
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

-- ───────────── Հրավերի կոդ՝ արդեն գրանցված հաշվի համար ─────────────
-- Ցանկացածը (վարորդ, խանութ...) գրում է կոդը → դառնում է այդ ֆիրմայի աշխատողը՝ կոդում նշված դերով
create or replace function accept_invite(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  e employees;
  fname text;
begin
  if auth.uid() is null then raise exception 'Մուտք գործեք'; end if;
  if exists (select 1 from employees where user_id = auth.uid() and active) then
    raise exception 'Դուք արդեն ֆիրմայի աշխատող եք';
  end if;
  select * into e from employees where invite_code = trim(p_code) and user_id is null;
  if e.id is null then raise exception 'Կոդը սխալ է կամ արդեն օգտագործված'; end if;
  update employees set user_id = auth.uid(), invite_code = null,
    name = coalesce((select name from driver_profiles where user_id = auth.uid()), name),
    phone = coalesce(phone, (select phone from driver_profiles where user_id = auth.uid()))
    where id = e.id;
  select name into fname from firms where id = e.firm_id;
  return fname;
end $$;
grant execute on function accept_invite(text) to authenticated;
