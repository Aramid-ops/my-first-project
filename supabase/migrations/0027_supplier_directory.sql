-- Մատակարարների ցուցակ («Բոլոր մատակարարները»). խանութը տեսնում է ֆիրմայի տվյալները և տեսականին
-- (առանց գների. գները՝ միանալուց հետո, քանի որ ամեն խանութի համար կարող են տարբեր լինել)։

alter table firms add column if not exists description text check (length(description) <= 500);
alter table firms add column if not exists phone text check (length(phone) <= 20);
grant update (description, phone) on firms to authenticated;

create or replace function firm_assortment(p_firm uuid)
returns table (id uuid, sku text, name text, image_url text, unit text, pack_note text, in_stock boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.sku, p.name, p.image_url, p.unit::text, p.pack_note, p.in_stock
  from products p
  where p.firm_id = p_firm and (select auth.uid()) is not null
  order by p.in_stock desc, p.name
  limit 300
$$;
revoke execute on function firm_assortment(uuid) from public, anon;
grant execute on function firm_assortment(uuid) to authenticated;
