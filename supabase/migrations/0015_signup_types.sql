-- Գրանցման 4 տեսակ (SPEC §4.3.2)
--   shop     — խանութ / ռեստորան (ՀՎՀՀ, հասցե)
--   manager  — մատակարար (մենեջեր) ինքնուրույն. ընտրում է ֆիրման ցուցակից կամ գրում նորի անունը
--              → ֆիրման ստեղծվում է «unclaimed» վիճակով, մենեջերը կառավարում է ապրանքները
--   firm     — ֆիրմա (տեր / ղեկավար). նոր կամ «վերցնում է» արդեն եղած unclaimed ֆիրման
--              → իր մենեջերները, խանութները, պատվերները մնում են
--   employee — ֆիրմայի աշխատող՝ հրավերի կոդով

alter table firms add column if not exists status text not null default 'active' check (status in ('active', 'unclaimed'));
alter table firms add column if not exists legal_name text;
alter table firms add column if not exists tax_id text;
alter table firms add column if not exists address text;

-- Ով կարող է կառավարել ֆիրմայի ապրանքներն ու տվյալները.
-- ղեկավարը, կամ (քանի դեռ ֆիրման չի գրանցվել) նրա մենեջերը
create or replace function can_manage_firm(f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_firm_admin(f) or exists (
    select 1 from employees e join firms x on x.id = e.firm_id
    where e.user_id = auth.uid() and e.active and e.firm_id = f and x.status = 'unclaimed' and e.role = 'manager')
    or exists (select 1 from employees e where e.user_id = auth.uid() and e.active and e.firm_id = f and e.role = 'staff')
$$;
grant execute on function can_manage_firm(uuid) to authenticated;

drop policy if exists products_write on products;
create policy products_write on products for all to authenticated
  using (can_manage_firm(firm_id)) with check (can_manage_firm(firm_id));

drop policy if exists media_firm_write on storage.objects;
create policy media_firm_write on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (storage.foldername(name))[1] = 'firm' and can_manage_firm(((storage.foldername(name))[2])::uuid)
);

drop policy if exists firms_admin_update on firms;
create policy firms_admin_update on firms for update to authenticated using (can_manage_firm(id)) with check (can_manage_firm(id));
grant update (legal_name, tax_id, address) on firms to authenticated;

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
      update firms set status = 'active', name = m->>'firm_name', legal_name = m->>'legal_name', tax_id = m->>'tax_id',
        address = m->>'address', category = coalesce(m->>'category', category) where id = fid;
    else
      insert into firms (name, legal_name, tax_id, address, category, status)
      values (m->>'firm_name', m->>'legal_name', m->>'tax_id', m->>'address', m->>'category', 'active')
      returning id into fid;
    end if;
    insert into employees (firm_id, user_id, name, role, phone) values (fid, new.id, coalesce(m->>'name', 'Ղեկավար'), 'admin', m->>'phone');

  elsif k = 'employee' and coalesce(m->>'code', '') <> '' then
    update employees set user_id = new.id, invite_code = null
      where invite_code = m->>'code' and user_id is null;
  end if;
  return new;
end $$;

-- Միանալու հայտ. եթե թաղամասով մենեջեր չգտնվեց՝ ֆիրմայի միակ / առաջին մենեջերը
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
  if mgr is null then
    select id into mgr from employees where firm_id = p_firm and role = 'manager' and active order by name limit 1;
  end if;
  insert into shop_firm_links (shop_id, firm_id, manager_id, status)
    values (sid, p_firm, mgr, 'pending')
    on conflict (shop_id, firm_id) do nothing;
  perform push_to_users(
    array(select user_id from employees where firm_id = p_firm and active and user_id is not null and (role = 'admin' or id = mgr)),
    '🆕 Միանալու հայտ', (select name from shops where id = sid), jsonb_build_object('shopId', sid));
end $$;

-- Նոր ֆիրման ավտոմատ ստանում է արտիկուլի 2-տառ նախածանց (անվան առաջին տառերից, եթե ազատ է)
create or replace function firms_assign_prefix() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text := upper(regexp_replace(search_skeleton(new.name), '[^a-z]', '', 'g'));
  cand text;
  a int; b int;
begin
  if new.sku_prefix is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('firm-prefix'));
  cand := substr(k, 1, 2);
  if length(cand) = 2 and not exists (select 1 from firms where sku_prefix = cand) then
    new.sku_prefix := cand; return new;
  end if;
  for i in 2..length(k) loop                       -- առաջին տառ + հաջորդներից մեկը
    cand := substr(k, 1, 1) || substr(k, i, 1);
    if not exists (select 1 from firms where sku_prefix = cand) then new.sku_prefix := cand; return new; end if;
  end loop;
  for a in 65..90 loop for b in 65..90 loop       -- ցանկացած ազատ զույգ
    cand := chr(a) || chr(b);
    if not exists (select 1 from firms where sku_prefix = cand) then new.sku_prefix := cand; return new; end if;
  end loop; end loop;
  return new;
end $$;
revoke execute on function firms_assign_prefix() from public, anon, authenticated;
drop trigger if exists firms_assign_prefix on firms;
create trigger firms_assign_prefix before insert on firms for each row execute function firms_assign_prefix();
update firms set sku_prefix = null where false;  -- (գոյություն ունեցողները արդեն ունեն)

-- Գրանցման էջի համար (դեռ մուտք չգործած). ֆիրմաների անուններն ու վիճակը միայն
create or replace function public_firms()
returns table (id uuid, name text, category text, status text)
language sql stable security definer set search_path = public as $$
  select id, name, category, status from firms order by name
$$;
grant execute on function public_firms() to anon, authenticated;
