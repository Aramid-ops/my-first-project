-- Հարթակի ադմին (մենք). ստուգում ենք վարորդների նույնականացումը և ֆիրմաների «վերցնելը»
create policy platform_admins_self on platform_admins for select to authenticated using (user_id = auth.uid());
grant select on platform_admins to authenticated;

create or replace function pending_verifications()
returns table (user_id uuid, name text, phone text, license_categories text[], front text, back text, selfie text, submitted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.user_id, d.name, d.phone, d.license_categories, d.kyc_license_front, d.kyc_license_back, d.kyc_selfie_passport, d.verification_submitted_at
  from driver_profiles d
  where d.verification_status = 'pending' and exists (select 1 from platform_admins where user_id = auth.uid())
  order by d.verification_submitted_at
$$;
grant execute on function pending_verifications() to authenticated;

create or replace function pending_claims()
returns table (id uuid, firm_name text, data jsonb, email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, f.name, c.data, u.email, c.created_at
  from firm_claims c join firms f on f.id = c.firm_id join auth.users u on u.id = c.user_id
  where c.status = 'pending' and exists (select 1 from platform_admins where user_id = auth.uid())
  order by c.created_at
$$;
grant execute on function pending_claims() to authenticated;
