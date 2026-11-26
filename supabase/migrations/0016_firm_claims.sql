-- Ֆիրմայի «վերցնելը» (claim) հաստատում է հարթակը (մենք). SPEC §4.3.2
-- Ով գրանցվում է որպես ֆիրմա և ընտրում արդեն եղած (unclaimed) ֆիրման → հայտ firm_claims-ում։
-- Հաստատելուց հետո՝ ֆիրման ակտիվ է, հայտատուն՝ ղեկավար, մենեջերները մնում են։
-- Նոր ֆիրմա (առանց «վերցնելու») գրանցվում է միանգամից։

create table if not exists platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table platform_admins enable row level security;

create table if not exists firm_claims (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,               -- անուն, հեռախոս, իրավաբանական տվյալներ, ՀՎՀՀ...
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table firm_claims enable row level security;
create policy firm_claims_own on firm_claims for select to authenticated using (user_id = auth.uid());
grant select on firm_claims to authenticated;

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
      insert into firm_claims (firm_id, user_id, data) values (fid, new.id, m);   -- սպասում է հաստատման
    else
      insert into firms (name, legal_name, tax_id, address, category, status)
      values (m->>'firm_name', m->>'legal_name', m->>'tax_id', m->>'address', m->>'category', 'active')
      returning id into fid;
      insert into employees (firm_id, user_id, name, role, phone) values (fid, new.id, coalesce(m->>'name', 'Ղեկավար'), 'admin', m->>'phone');
    end if;

  elsif k = 'employee' and coalesce(m->>'code', '') <> '' then
    update employees set user_id = new.id, invite_code = null where invite_code = m->>'code' and user_id is null;
  end if;
  return new;
end $$;

-- Հաստատում / մերժում. միայն հարթակի ադմինը (կամ մենք՝ սերվերից)
create or replace function decide_firm_claim(p_claim uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  c firm_claims;
begin
  if auth.uid() is not null and not exists (select 1 from platform_admins where user_id = auth.uid()) then
    raise exception 'Միայն հարթակի ադմինը';
  end if;
  select * into c from firm_claims where id = p_claim and status = 'pending';
  if c.id is null then raise exception 'Հայտը չի գտնվել'; end if;
  if p_approve then
    update firms set status = 'active', name = c.data->>'firm_name', legal_name = c.data->>'legal_name',
      tax_id = c.data->>'tax_id', address = c.data->>'address', category = coalesce(c.data->>'category', category)
      where id = c.firm_id;
    insert into employees (firm_id, user_id, name, role, phone)
      values (c.firm_id, c.user_id, coalesce(c.data->>'name', 'Ղեկավար'), 'admin', c.data->>'phone');
    update firm_claims set status = 'rejected', decided_at = now() where firm_id = c.firm_id and status = 'pending' and id <> c.id;
  end if;
  update firm_claims set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now() where id = c.id;
end $$;
revoke execute on function decide_firm_claim(uuid, boolean) from public, anon;
grant execute on function decide_firm_claim(uuid, boolean) to authenticated;
