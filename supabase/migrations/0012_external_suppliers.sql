-- Մատակարար, որը հավելվածում չէ (SPEC §14.2). խանութը պահում է անունն ու հեռախոսը,
-- պատվերը գնում է Viber / WhatsApp / SMS հաղորդագրությամբ (հեռախոսից)։
create table if not exists external_suppliers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  phone text not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'viber', 'sms')),
  created_at timestamptz not null default now()
);
alter table external_suppliers enable row level security;
create policy external_suppliers_own on external_suppliers for all to authenticated
  using (is_shop_member(shop_id)) with check (is_shop_member(shop_id));
grant select, insert, update, delete on external_suppliers to authenticated;
