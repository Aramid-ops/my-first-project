-- Որոնում. 1–2 տառով՝ միայն բառի սկզբից (որ «աթ»-ը չբերի «Հացատուն»-ը); 3+ տառից՝ նաև մեջտեղից և մոտավոր
create or replace function search_products(q text, max_rows int default 30)
returns table (product_id uuid, firm_id uuid, sku text, name text, unit text, price numeric, in_stock boolean, firm_name text, score real)
language sql stable security invoker set search_path = public as $$
  with k as (select search_skeleton(q) as key, upper(regexp_replace(q, '\s', '', 'g')) as code)
  select p.id, p.firm_id, p.sku, p.name, p.unit, p.price, p.in_stock, f.name,
    (case
       when p.sku = k.code then 100
       when p.sku like k.code || '%' and length(k.code) >= 2 then 50
       when p.search_key like k.key || '%' then 30
       when p.search_key like '% ' || k.key || '%' then 25
       when p.search_key like '%' || k.key || '%' then 15
       else 0
     end + 10 * word_similarity(k.key, p.search_key))::real
  from products p join firms f on f.id = p.firm_id cross join k
  where length(k.key) >= 1 and (
      p.sku = k.code
      or (length(k.code) >= 2 and p.sku like k.code || '%')
      or p.search_key like k.key || '%'
      or p.search_key like '% ' || k.key || '%'
      or (length(k.key) >= 3 and p.search_key like '%' || k.key || '%')
      or (length(k.key) >= 3 and k.key <% p.search_key))
  order by 9 desc, p.in_stock desc, p.name
  limit max_rows
$$;
