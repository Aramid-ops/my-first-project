-- Նույնականացում՝ անձնագրով ԿԱՄ նույնականացման քարտով (ID քարտ)
alter table driver_profiles add column if not exists kyc_document_type text not null default 'passport'
  check (kyc_document_type in ('passport', 'id_card'));

create or replace function submit_driver_verification(p_front text, p_back text, p_selfie text, p_doc text default 'passport') returns void
language plpgsql security definer set search_path = public as $$
declare
  u text := auth.uid()::text;
begin
  if not exists (select 1 from driver_profiles where user_id = auth.uid()) then raise exception 'Վարորդի պրոֆիլ չկա'; end if;
  if split_part(p_front, '/', 1) <> u or split_part(p_back, '/', 1) <> u or split_part(p_selfie, '/', 1) <> u then
    raise exception 'Լուսանկարները պետք է լինեն ձեր պանակում';
  end if;
  update driver_profiles set kyc_license_front = p_front, kyc_license_back = p_back, kyc_selfie_passport = p_selfie,
    kyc_document_type = case when p_doc = 'id_card' then 'id_card' else 'passport' end,
    verification_status = 'pending', verification_note = null, verification_submitted_at = now()
  where user_id = auth.uid() and verification_status <> 'approved';
end $$;
drop function if exists submit_driver_verification(text, text, text);
grant execute on function submit_driver_verification(text, text, text, text) to authenticated;

drop function if exists pending_verifications();
create or replace function pending_verifications()
returns table (user_id uuid, name text, phone text, license_categories text[], front text, back text, selfie text, submitted_at timestamptz, document_type text)
language sql stable security definer set search_path = public as $$
  select d.user_id, d.name, d.phone, d.license_categories, d.kyc_license_front, d.kyc_license_back, d.kyc_selfie_passport, d.verification_submitted_at, d.kyc_document_type
  from driver_profiles d
  where d.verification_status = 'pending' and exists (select 1 from platform_admins where user_id = auth.uid())
  order by d.verification_submitted_at
$$;
