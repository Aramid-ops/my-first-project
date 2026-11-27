-- Մատակարարի «📣 Հարցումներ» էջը. բաց հարցումները՝ խանութի անունով և թաղամասով, իմ առաջարկով (եթե արդեն ուղարկել եմ)
create or replace function open_supply_requests()
returns table (id uuid, text text, category text, price_hint numeric, created_at timestamptz,
               shop_name text, district text, phone text, my_offer text, mine_category boolean)
language sql stable security definer set search_path = public as $$
  with me as (select e.firm_id from employees e where e.user_id = (select auth.uid()) and e.active limit 1)
  select r.id, r.text, r.category, r.price_hint, r.created_at,
    s.name, s.district, case when s.listed then s.phone end,
    (select o.text from supply_offers o where o.request_id = r.id and o.firm_id = me.firm_id),
    exists (select 1 from products p where p.firm_id = me.firm_id and p.category = r.category)
  from supply_requests r join shops s on s.id = r.shop_id cross join me
  where r.status = 'open' and r.created_at > now() - interval '30 days'
  order by r.created_at desc
  limit 200
$$;
revoke execute on function open_supply_requests() from public, anon;
grant execute on function open_supply_requests() to authenticated;
