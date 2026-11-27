-- Մատակարարը որոնում է խանութներ ըստ ապրանքի (օր.՝ «ձու»). ովքեր են գնում և մոտավորապես ինչքան։
-- Գաղտնիություն. ՉԵՆՔ ցույց տալիս, թե ումից է գնում խանութը և ինչ գնով։ Ծավալը՝ միայն կլորացված միջակայքով։
-- Երևում են միայն այն խանութները, որոնք չեն թաքցրել իրենց («Երևալ մատակարարներին»)։

create or replace function shop_demand(q text)
returns table (
  id uuid, name text, district text, address text, phone text, contact_person text,
  distance_km numeric, is_client boolean, qty_band text, unit text, last_band text)
language sql stable security definer set search_path = public as $$
  with me as (select e.firm_id from employees e where e.user_id = (select auth.uid()) and e.active limit 1),
       f as (select firms.* from firms join me on me.firm_id = firms.id),
       k as (select search_skeleton(q) as key),
       prods as (
         select p.id, p.unit::text as unit from products p cross join k
         where length(k.key) >= 2 and (p.search_key like k.key || '%' or p.search_key like '% ' || k.key || '%')
       ),
       bought as (
         select o.shop_id, pr.unit, sum(oi.qty) as qty, max(o.created_at) as last_at
         from order_items oi
         join prods pr on pr.id = oi.product_id
         join orders o on o.id = oi.order_id
         where o.created_at > now() - interval '90 days' and o.status <> 'returned'
         group by o.shop_id, pr.unit
       ),
       best as (   -- ամեն խանութի համար՝ ամենաշատ գնվող միավորը
         select distinct on (shop_id) shop_id, unit, qty, last_at from bought order by shop_id, qty desc
       )
  select s.id, s.name, s.district, s.address, s.phone, s.contact_person,
    round(km_between(f.base_lat, f.base_lng, s.lat, s.lng)::numeric, 1),
    exists (select 1 from shop_firm_links l where l.shop_id = s.id and l.firm_id = f.id and l.status = 'active'),
    -- ամսական ծավալը (90 օր / 3)՝ միայն միջակայքով, ոչ ճշգրիտ թիվ
    case when b.qty / 3 < 10 then 'մինչև 10' when b.qty / 3 < 50 then '10–50' when b.qty / 3 < 100 then '50–100'
         when b.qty / 3 < 300 then '100–300' when b.qty / 3 < 500 then '300–500' when b.qty / 3 < 1000 then '500–1000'
         else '1000+' end,
    b.unit,
    case when b.last_at > now() - interval '7 days' then 'այս շաբաթ'
         when b.last_at > now() - interval '30 days' then 'այս ամիս' else 'ավելի վաղ' end
  from best b join shops s on s.id = b.shop_id cross join f
  where s.listed
  order by b.qty desc
  limit 300
$$;
revoke execute on function shop_demand(text) from public, anon;
grant execute on function shop_demand(text) to authenticated;
