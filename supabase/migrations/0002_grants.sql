-- Թույլտվություններ մուտք գործած օգտատերերի համար։
-- Ինչ տողեր է տեսնում / փոխում ամեն մեկը՝ որոշում են RLS կանոնները (0001_init.sql)։
-- Չմուտք գործածները (anon) ոչինչ չեն տեսնում։

grant usage on schema public to authenticated;

grant select on all tables in schema public to authenticated;

grant insert on shop_firm_links, orders, order_items, order_events, order_issues, payments to authenticated;
grant update on orders, order_items, payments to authenticated;
grant insert, update, delete on products to authenticated;

grant usage, select on all sequences in schema public to authenticated;
grant execute on function my_employee(), is_shop_member(uuid) to authenticated;

revoke all on all tables in schema public from anon;
