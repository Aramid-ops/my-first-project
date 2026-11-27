-- «Live շուկա». երկու պատուհան, որ թարմանում են ակնթարթորեն.
--   1. Խանութները ուզում են (supply_requests)՝ մատակարարները սեղմում են → «Առաջարկել»
--   2. Մատակարարները առաջարկում են (supplier_deals)՝ խանութները սեղմում են → «Հետաքրքրված եմ»

create table if not exists supplier_deals (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms (id) on delete cascade,
  employee_id uuid references employees (id) on delete set null,
  text text not null check (length(trim(text)) between 2 and 500),   -- «Ձու C0, թարմ, Աջափնյակ և Արաբկիր»
  category text,
  price numeric(12, 2) check (price > 0),                               -- ըստ ցանկության
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists supplier_deals_firm_idx on supplier_deals (firm_id);
create index if not exists supplier_deals_employee_idx on supplier_deals (employee_id);
create index if not exists supplier_deals_open_idx on supplier_deals (status, created_at desc);

create table if not exists deal_interests (
  deal_id uuid not null references supplier_deals (id) on delete cascade,
  shop_id uuid not null references shops (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (deal_id, shop_id)
);
create index if not exists deal_interests_shop_idx on deal_interests (shop_id);

alter table supplier_deals enable row level security;
alter table deal_interests enable row level security;
create policy supplier_deals_read on supplier_deals for select to authenticated using (true);
create policy supplier_deals_write on supplier_deals for insert to authenticated with check (
  firm_id = (select (my_employee()).firm_id) and employee_id = (select (my_employee()).id));
create policy supplier_deals_close on supplier_deals for update to authenticated
  using (firm_id = (select (my_employee()).firm_id)) with check (firm_id = (select (my_employee()).firm_id));
grant select, insert on supplier_deals to authenticated;
grant update (status) on supplier_deals to authenticated;

create policy deal_interests_own on deal_interests for select to authenticated using (
  is_shop_member(shop_id) or exists (select 1 from supplier_deals d where d.id = deal_id and d.firm_id = (select (my_employee()).firm_id)));
create policy deal_interests_write on deal_interests for insert to authenticated with check (is_shop_member(shop_id));
grant select, insert on deal_interests to authenticated;

create or replace function supplier_deals_fill() returns trigger
language plpgsql set search_path = public as $$
begin
  new.category := guess_category(new.text);
  return new;
end $$;
drop trigger if exists supplier_deals_fill on supplier_deals;
create trigger supplier_deals_fill before insert on supplier_deals for each row execute function supplier_deals_fill();

-- «Հետաքրքրված եմ» → ծանուցում առաջարկը տեղադրողին և ֆիրմայի ղեկավարին
create or replace function deal_interests_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare d supplier_deals := (select d from supplier_deals d where d.id = new.deal_id);
begin
  perform push_to_users(
    array(select user_id from employees where active and user_id is not null and (id = d.employee_id or (firm_id = d.firm_id and role = 'admin'))),
    '🙋 ' || (select name from shops where id = new.shop_id) || '-ը հետաքրքրված է', left(d.text, 120),
    jsonb_build_object('dealId', d.id));
  return new;
end $$;
revoke execute on function deal_interests_notify() from public, anon, authenticated;
drop trigger if exists deal_interests_notify on deal_interests;
create trigger deal_interests_notify after insert on deal_interests for each row execute function deal_interests_notify();

-- Խանութների հարցումները բոլորի համար. մատակարարը տեսնում է խանութի անունը և հեռախոսը, ուրիշ խանութը՝ միայն թաղամասը
create or replace function live_requests()
returns table (id uuid, text text, category text, price_hint numeric, created_at timestamptz,
               shop_name text, district text, phone text, mine boolean, my_offer text, offers int)
language sql stable security definer set search_path = public as $$
  with me as (select (select e.firm_id from employees e where e.user_id = (select auth.uid()) and e.active limit 1) as firm_id,
                     (select m.shop_id from shop_members m where m.user_id = (select auth.uid()) limit 1) as shop_id)
  select r.id, r.text, r.category, r.price_hint, r.created_at,
    case when me.firm_id is not null or r.shop_id = me.shop_id then s.name end,
    s.district,
    case when me.firm_id is not null and s.listed then s.phone end,
    r.shop_id = me.shop_id,
    (select o.text from supply_offers o where o.request_id = r.id and o.firm_id = me.firm_id),
    (select count(*)::int from supply_offers o where o.request_id = r.id)
  from supply_requests r join shops s on s.id = r.shop_id cross join me
  where r.status = 'open' and r.created_at > now() - interval '30 days' and (select auth.uid()) is not null
  order by r.created_at desc
  limit 200
$$;
revoke execute on function live_requests() from public, anon;
grant execute on function live_requests() to authenticated;

-- Մատակարարների առաջարկները. խանութը տեսնում է՝ արդեն հետաքրքրվե՞լ է, ֆիրման՝ քանի խանութ է հետաքրքրվել
create or replace function live_deals()
returns table (id uuid, firm_id uuid, firm_name text, firm_logo text, text text, category text, price numeric,
               created_at timestamptz, employee_name text, phone text, mine boolean, interested boolean, interests int)
language sql stable security definer set search_path = public as $$
  with me as (select (select e.firm_id from employees e where e.user_id = (select auth.uid()) and e.active limit 1) as firm_id,
                     (select m.shop_id from shop_members m where m.user_id = (select auth.uid()) limit 1) as shop_id)
  select d.id, d.firm_id, f.name, f.logo_url, d.text, d.category, d.price, d.created_at,
    e.name, coalesce(e.phone, f.phone),
    d.firm_id = me.firm_id,
    exists (select 1 from deal_interests i where i.deal_id = d.id and i.shop_id = me.shop_id),
    case when d.firm_id = me.firm_id then (select count(*)::int from deal_interests i where i.deal_id = d.id) end
  from supplier_deals d join firms f on f.id = d.firm_id left join employees e on e.id = d.employee_id cross join me
  where d.status = 'open' and d.created_at > now() - interval '30 days' and (select auth.uid()) is not null
  order by d.created_at desc
  limit 200
$$;
revoke execute on function live_deals() from public, anon;
grant execute on function live_deals() to authenticated;

-- Ով է հետաքրքրվել իմ առաջարկով (միայն առաջարկը տեղադրած ֆիրմայի համար)
create or replace function deal_interested_shops(p_deal uuid)
returns table (shop_id uuid, name text, district text, address text, phone text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.district, s.address, s.phone, i.created_at
  from deal_interests i join shops s on s.id = i.shop_id join supplier_deals d on d.id = i.deal_id
  where i.deal_id = p_deal and d.firm_id = (select e.firm_id from employees e where e.user_id = (select auth.uid()) and e.active limit 1)
  order by i.created_at desc
$$;
revoke execute on function deal_interested_shops(uuid) from public, anon;
grant execute on function deal_interested_shops(uuid) to authenticated;

alter publication supabase_realtime add table supply_requests;
alter publication supabase_realtime add table supply_offers;
alter publication supabase_realtime add table supplier_deals;
alter publication supabase_realtime add table deal_interests;
