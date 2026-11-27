-- Հավելվածից դուրս մատակարարին (WhatsApp / Viber / SMS) ուղարկված պատվերները պահվում են
-- խանութի պատվերների ցուցակում, որ ամեն ինչ մեկ տեղում լինի։
create table external_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops (id) on delete cascade,
  supplier_id uuid references external_suppliers (id) on delete set null,
  supplier_name text not null,   -- մնում է, եթե մատակարարին ջնջեն
  channel text not null check (channel in ('whatsapp', 'viber', 'sms')),
  text text not null check (length(trim(text)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index external_orders_shop_idx on external_orders (shop_id, created_at desc);
create index external_orders_supplier_idx on external_orders (supplier_id);
create index if not exists external_suppliers_shop_idx on external_suppliers (shop_id);

alter table external_orders enable row level security;
create policy external_orders_own on external_orders for all to authenticated
  using (is_shop_member(shop_id)) with check (is_shop_member(shop_id));
grant select, insert, delete on external_orders to authenticated;
