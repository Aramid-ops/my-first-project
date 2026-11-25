-- Մատակարար · տվյալների բազայի սկզբնական կառուցվածք
-- Համապատասխանում է docs/SPEC.md-ին (§2–§7) և app/src/lib/types.ts-ին։
-- Ամեն դեր տեսնում է միայն իրենը՝ Row Level Security (RLS) կանոններով։

create extension if not exists "pgcrypto";

-- ───────────────────────── Ֆիրմաներ և աշխատողներ ─────────────────────────

create table firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  logo_url text,
  created_at timestamptz not null default now()
);

create type employee_role as enum ('admin', 'manager', 'staff', 'driver');

create table employees (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  role employee_role not null,
  department text,                         -- «Առաքման բաժին», «Պահեստ»... (ֆիրման ինքն է անվանում)
  default_forward_to uuid references employees(id),
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on employees (firm_id);

-- Տարածքներ → մենեջերներ և գծի օրեր (§4)
create table territories (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  city text not null,
  district text,                           -- null = ամբողջ քաղաքը
  delivery_days smallint[] not null default '{}', -- 1=երկուշաբթի … 7=կիրակի; դատարկ = ամեն օր
  order_cutoff time                          -- օր.՝ 18:00 (ըստ ցանկության)
);
create table territory_managers (
  territory_id uuid references territories(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  primary key (territory_id, employee_id)
);

-- ───────────────────────── Խանութներ ─────────────────────────

create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text not null,                    -- ՀՎՀՀ
  city text not null,
  district text,
  address text,
  lat double precision,
  lng double precision,
  phone text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table shop_members (
  shop_id uuid references shops(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (shop_id, user_id)
);

-- Խանութ ↔ ֆիրմա. ճիշտ մեկ մենեջեր (§2, կանոն 2)
create type link_status as enum ('pending', 'active', 'paused');
create table shop_firm_links (
  shop_id uuid references shops(id) on delete cascade,
  firm_id uuid references firms(id) on delete cascade,
  manager_id uuid references employees(id),
  status link_status not null default 'pending',
  delivery_days smallint[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (shop_id, firm_id)
);

-- ───────────────────────── Ապրանքներ ─────────────────────────

create table products (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  code text,                               -- ֆիրմայի հաշվապահական ծրագրի կոդը
  barcode text,
  name text not null,
  image_url text,
  unit text not null,                      -- հատ, կգ, լ, մ, տուփ, բլոկ, արկղ...
  pack_note text,                          -- «1 բլոկ = 30 հատ»
  price numeric(12,2) not null,
  min_qty numeric(12,3) not null default 1,
  step numeric(12,3) not null default 1,
  allow_smaller_with_approval boolean not null default false,
  weighed boolean not null default false,
  in_stock boolean not null default true,
  attributes jsonb not null default '{}',  -- ազատ հատկություններ (շերտեր, ծավալ, համ...)
  created_at timestamptz not null default now()
);
create index on products (firm_id);

-- ───────────────────────── Պատվերներ ─────────────────────────

create type order_status as enum ('sent', 'accepted', 'preparing', 'on_the_way', 'delivered', 'returned');

create table orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  firm_id uuid not null references firms(id),
  manager_id uuid not null references employees(id),
  assignee_id uuid references employees(id),   -- ներսում ում մոտ է հիմա
  driver_id uuid references employees(id),
  status order_status not null default 'sent',
  delivery_date date not null,
  invoice_number text,                         -- պաշտոնական ֆակտուրայի համարը (§6.1)
  created_at timestamptz not null default now()
);
create index on orders (firm_id, status);
create index on orders (shop_id);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  qty numeric(12,3) not null,
  actual_qty numeric(12,3),                    -- կշռվող ապրանքի իրական քանակը
  price numeric(12,2) not null                 -- գինը պատվերի պահին
);

-- Ով, երբ, ինչ արեց (§5 «Պատմություն»)
create table order_events (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  actor_user uuid references auth.users(id),
  actor_name text not null,
  text text not null,
  at timestamptz not null default now()
);

-- Խանութի նշած խնդիրներ (ջարդված, պակաս...) — միայն տեղեկություն (§7.4.1)
create table order_issues (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  kind text not null check (kind in ('broken', 'missing', 'wrong', 'expired')),
  qty numeric(12,3),
  photo_url text,
  note text,
  created_at timestamptz not null default now()
);

-- Վճարումներ (§6.3). պարտքը = առաքված պատվերներ − հաստատված վճարումներ
create table payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  firm_id uuid not null references firms(id),
  amount numeric(12,2) not null,
  method text not null default 'transfer',
  marked_paid_by_shop_at timestamptz,
  confirmed_by uuid references employees(id),
  confirmed_at timestamptz,
  note text
);

-- ───────────────────────── Օգնական ֆունկցիաներ ─────────────────────────

create function my_employee() returns employees
language sql stable security definer set search_path = public as $$
  select * from employees where user_id = auth.uid() and active limit 1
$$;

create function is_shop_member(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from shop_members where shop_id = s and user_id = auth.uid())
$$;

-- ───────────────────────── RLS ─────────────────────────

alter table firms enable row level security;
alter table employees enable row level security;
alter table territories enable row level security;
alter table territory_managers enable row level security;
alter table shops enable row level security;
alter table shop_members enable row level security;
alter table shop_firm_links enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_events enable row level security;
alter table order_issues enable row level security;
alter table payments enable row level security;

-- Ֆիրմաների կատալոգը տեսանելի է բոլոր մուտք գործածներին (խանութը պետք է գտնի մատակարարին)
create policy firms_read on firms for select to authenticated using (true);

-- Աշխատողներ. նույն ֆիրմայի աշխատողները իրար տեսնում են; խանութը տեսնում է իր մենեջերին
create policy employees_read on employees for select to authenticated using (
  firm_id = (my_employee()).firm_id
  or exists (select 1 from shop_firm_links l where l.manager_id = employees.id and is_shop_member(l.shop_id))
);

create policy territories_read on territories for select to authenticated using (firm_id = (my_employee()).firm_id);
create policy territory_managers_read on territory_managers for select to authenticated using (
  exists (select 1 from territories t where t.id = territory_id and t.firm_id = (my_employee()).firm_id)
);

-- Խանութ. իր անդամները + այն ֆիրմաները, որոնց հետ կապ ունի
create policy shops_read on shops for select to authenticated using (
  is_shop_member(id)
  or exists (select 1 from shop_firm_links l where l.shop_id = shops.id and l.firm_id = (my_employee()).firm_id)
);
create policy shop_members_read on shop_members for select to authenticated using (user_id = auth.uid());

create policy links_read on shop_firm_links for select to authenticated using (
  is_shop_member(shop_id) or firm_id = (my_employee()).firm_id
);
-- Խանութը կարող է հայտ ուղարկել (pending), մենեջեր ընտրում է ֆիրման
create policy links_request on shop_firm_links for insert to authenticated with check (
  is_shop_member(shop_id) and status = 'pending'
);

-- Ապրանքներ. ֆիրմայի աշխատողները + կապված խանութները
create policy products_read on products for select to authenticated using (
  firm_id = (my_employee()).firm_id
  or exists (select 1 from shop_firm_links l where l.firm_id = products.firm_id and l.status = 'active' and is_shop_member(l.shop_id))
);
create policy products_write on products for all to authenticated using (
  firm_id = (my_employee()).firm_id and (my_employee()).role in ('admin', 'staff')
) with check (
  firm_id = (my_employee()).firm_id and (my_employee()).role in ('admin', 'staff')
);

-- Պատվերներ
--  · խանութը տեսնում է իր պատվերները
--  · մենեջերը՝ իրենը, վարորդը՝ իրեն կցվածները, ադմինն ու ներքին աշխատողները՝ ֆիրմայինը
create policy orders_read on orders for select to authenticated using (
  is_shop_member(shop_id)
  or (firm_id = (my_employee()).firm_id and (
        (my_employee()).role in ('admin', 'staff')
        or manager_id = (my_employee()).id
        or driver_id = (my_employee()).id))
);
create policy orders_create on orders for insert to authenticated with check (
  is_shop_member(shop_id)
  and status = 'sent'
  and exists (select 1 from shop_firm_links l
              where l.shop_id = orders.shop_id and l.firm_id = orders.firm_id
                and l.status = 'active' and l.manager_id = orders.manager_id)
);
create policy orders_update on orders for update to authenticated using (
  firm_id = (my_employee()).firm_id
);

create policy order_items_read on order_items for select to authenticated using (
  exists (select 1 from orders o where o.id = order_id)
);
create policy order_items_create on order_items for insert to authenticated with check (
  exists (select 1 from orders o where o.id = order_id and is_shop_member(o.shop_id) and o.status = 'sent')
);
create policy order_items_update on order_items for update to authenticated using (
  exists (select 1 from orders o where o.id = order_id and o.firm_id = (my_employee()).firm_id)
);

create policy order_events_read on order_events for select to authenticated using (
  exists (select 1 from orders o where o.id = order_id)
);
create policy order_events_create on order_events for insert to authenticated with check (
  actor_user = auth.uid() and exists (select 1 from orders o where o.id = order_id)
);

create policy order_issues_read on order_issues for select to authenticated using (
  exists (select 1 from orders o where o.id = order_id)
);
create policy order_issues_create on order_issues for insert to authenticated with check (
  exists (select 1 from orders o where o.id = order_id and is_shop_member(o.shop_id))
);

create policy payments_read on payments for select to authenticated using (
  is_shop_member(shop_id) or firm_id = (my_employee()).firm_id
);
create policy payments_shop_mark on payments for insert to authenticated with check (
  is_shop_member(shop_id) and confirmed_at is null
);
create policy payments_confirm on payments for update to authenticated using (
  firm_id = (my_employee()).firm_id and (my_employee()).role in ('admin', 'staff')
);
