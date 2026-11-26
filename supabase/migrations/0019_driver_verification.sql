-- Վարորդի նույնականացում (SPEC §4.3.4)
-- 3 լուսանկար. վարորդական իրավունք (առջև, հետև) + անձնագիրը դեմքի մոտ (սելֆի)։
-- Պահվում են ՓԱԿ պահոցում (kyc). տեսնում են միայն վարորդը և հարթակի ստուգողները։
-- Ֆիրմաները տեսնում են միայն արդյունքը (նույնականացված է / ոչ)։

insert into storage.buckets (id, name, public) values ('kyc', 'kyc', false) on conflict (id) do nothing;

create policy kyc_upload_own on storage.objects for insert to authenticated with check (
  bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy kyc_read_own_or_admin on storage.objects for select to authenticated using (
  bucket_id = 'kyc' and ((storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from platform_admins where user_id = auth.uid()))
);

alter table driver_profiles add column if not exists verification_status text not null default 'none'
  check (verification_status in ('none', 'pending', 'approved', 'rejected'));
alter table driver_profiles add column if not exists verification_note text;
alter table driver_profiles add column if not exists verification_submitted_at timestamptz;
alter table driver_profiles add column if not exists kyc_license_front text;   -- պահոցի ուղի (ոչ հանրային հղում)
alter table driver_profiles add column if not exists kyc_license_back text;
alter table driver_profiles add column if not exists kyc_selfie_passport text;

-- Վարորդը ինքը չի կարող փոխել իր կարգավիճակը (միայն ուղարկել)
revoke update on driver_profiles from authenticated;
grant update (name, phone, address, license_categories, vehicle_type, vehicle_model, plate, capacity_kg, refrigerated, looking_for_work, district) on driver_profiles to authenticated;

create or replace function submit_driver_verification(p_front text, p_back text, p_selfie text) returns void
language plpgsql security definer set search_path = public as $$
declare
  u text := auth.uid()::text;
begin
  if not exists (select 1 from driver_profiles where user_id = auth.uid()) then raise exception 'Վարորդի պրոֆիլ չկա'; end if;
  if split_part(p_front, '/', 1) <> u or split_part(p_back, '/', 1) <> u or split_part(p_selfie, '/', 1) <> u then
    raise exception 'Լուսանկարները պետք է լինեն ձեր պանակում';
  end if;
  update driver_profiles set kyc_license_front = p_front, kyc_license_back = p_back, kyc_selfie_passport = p_selfie,
    verification_status = 'pending', verification_note = null, verification_submitted_at = now()
  where user_id = auth.uid() and verification_status <> 'approved';
end $$;
grant execute on function submit_driver_verification(text, text, text) to authenticated;

-- Ստուգում. հարթակի ադմինը (կամ մենք՝ սերվերից)
create or replace function decide_driver_verification(p_user uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not exists (select 1 from platform_admins where user_id = auth.uid()) then
    raise exception 'Միայն հարթակի ադմինը';
  end if;
  update driver_profiles set verification_status = case when p_approve then 'approved' else 'rejected' end, verification_note = p_note
    where user_id = p_user and verification_status = 'pending';
  perform push_to_users(array[p_user], 'Մատակարար',
    case when p_approve then '✅ Նույնականացումն անցել է' else 'Նույնականացումը մերժվել է' || coalesce(': ' || p_note, '') end, '{}'::jsonb);
end $$;
revoke execute on function decide_driver_verification(uuid, boolean, text) from public, anon;
grant execute on function decide_driver_verification(uuid, boolean, text) to authenticated;

-- «Գտնել վարորդ»-ում՝ միայն նույնականացվածները
create or replace function available_drivers()
returns table (user_id uuid, name text, phone text, license_categories text[], vehicle_type text, vehicle_model text, capacity_kg numeric, refrigerated boolean, district text)
language sql stable security definer set search_path = public as $$
  select d.user_id, d.name, d.phone, d.license_categories, d.vehicle_type, d.vehicle_model, d.capacity_kg, d.refrigerated, d.district
  from driver_profiles d
  where d.looking_for_work and d.verification_status = 'approved'
    and not exists (select 1 from employees e where e.user_id = d.user_id and e.active)
    and exists (select 1 from employees me where me.user_id = auth.uid() and me.active and me.role in ('admin', 'manager', 'staff'))
  order by d.created_at desc
$$;

-- Ֆիրման իր վարորդների համար տեսնում է միայն «նույնականացված է / ոչ», ոչ թե փաստաթղթերը
create or replace function firm_driver_verification()
returns table (employee_id uuid, verified boolean)
language sql stable security definer set search_path = public as $$
  select e.id, coalesce(d.verification_status = 'approved', false)
  from employees e left join driver_profiles d on d.user_id = e.user_id
  where e.firm_id = (my_employee()).firm_id and e.role = 'driver'
$$;
grant execute on function firm_driver_verification() to authenticated;

-- Ֆիրմայի ընթերցման քաղաքականությունը չպետք է տա փաստաթղթերի ուղիները. սահմանափակում ենք սյուներով
drop policy if exists driver_profiles_firm on driver_profiles;
