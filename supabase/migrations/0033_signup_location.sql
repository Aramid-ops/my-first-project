-- Խանութը իր տեղը (📍) նշում է հենց գրանցվելիս, ոչ թե գլխավոր էջում
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
