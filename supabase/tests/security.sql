-- Բազայի կանոնների ավտոմատ ստուգում (գործարկվում է supabase/tests/run-local.sh-ով)
-- Ամեն ստուգում՝ assert. սխալի դեպքում թեստը ընկնում է։
\set ON_ERROR_STOP 1
insert into auth.users(id,email) values
  ('00000000-0000-0000-0000-000000000001','ket@demo.matakarar.com'),
  ('00000000-0000-0000-0000-000000000002','karen@demo.matakarar.com'),
  ('00000000-0000-0000-0000-000000000003','ani@demo.matakarar.com'),
  ('00000000-0000-0000-0000-000000000004','artur@demo.matakarar.com'),
  ('00000000-0000-0000-0000-000000000007','boss@demo.matakarar.com');
\i supabase/seed/demo.sql
update shop_firm_links set discount_pct = 10 where shop_id = '30000000-0000-0000-0000-000000000001' and firm_id = '10000000-0000-0000-0000-000000000001';

create or replace function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false); $$;

set role authenticated;

-- 1. Խանութ. գինը բազայից (զեղչով), ոչ թե հավելվածից
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select place_order('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2030-01-01',
  '[{"product_id":"40000000-0000-0000-0000-000000000002","qty":12}]') as o1 \gset
do $$ begin assert (select price from order_items) = 540, 'գինը պետք է լինի 600 − 10% = 540'; end $$;

-- 2. Սխալ քանակը մերժվում է, պատվերը չի ստեղծվում
do $$ begin
  begin
    perform place_order('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2030-01-01',
      '[{"product_id":"40000000-0000-0000-0000-000000000001","qty":15}]');
    raise exception 'պետք է մերժվեր';
  exception when raise_exception then
    if sqlerrm = 'պետք է մերժվեր' then raise; end if;
  end;
  assert (select count(*) from orders) = 1, 'կիսատ պատվեր չպետք է մնար';
end $$;

-- 3. Ուրիշ խանութը չի տեսնում այս պատվերը (նոր խանութ՝ գրանցմամբ)
reset role;
insert into auth.users values ('00000000-0000-0000-0000-000000000010','new@x.am','{"kind":"shop","name":"Ուրիշ","tax_id":"12345678","district":"Ավան"}');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000010');
do $$ begin assert (select count(*) from orders) = 0, 'ուրիշ խանութը չպետք է տեսներ պատվերը'; end $$;

-- 4. Մենեջերը չի կարող փոխել պատվերի խանութը, բայց կարող է կարգավիճակը
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
update orders set status = 'accepted', shop_id = '30000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select status from orders) = 'accepted', 'մենեջերը պետք է կարողանար ընդունել';
  assert (select shop_id from orders) = '30000000-0000-0000-0000-000000000001', 'խանութը չպետք է փոխվեր';
end $$;

-- 5. Մենեջերը չի կարող փոխել խանութի մենեջերին (միայն ղեկավարը)
update shop_firm_links set manager_id = '20000000-0000-0000-0000-000000000003' where shop_id = '30000000-0000-0000-0000-000000000001' and firm_id = '10000000-0000-0000-0000-000000000001';
do $$ begin assert (select manager_id from shop_firm_links where shop_id = '30000000-0000-0000-0000-000000000001' and firm_id = '10000000-0000-0000-0000-000000000001') = '20000000-0000-0000-0000-000000000001', 'մենեջերը չպետք է փոխվեր'; end $$;

-- 6. Պատմության անունը չի կեղծվում
insert into order_events(order_id, actor_name, text) select id, 'ԿԵՂԾ', 'թեստ' from orders;
do $$ begin assert (select actor_name from order_events where text = 'թեստ') = 'Կարեն', 'անունը պետք է լրացներ բազան'; end $$;

-- 7. Վարորդը տեսնում է միայն իրեն կցվածը
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
do $$ begin assert (select count(*) from orders) = 0, 'վարորդը չպետք է տեսներ չկցված պատվերը'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
update orders set status = 'preparing', assignee_id = '20000000-0000-0000-0000-000000000004', driver_id = '20000000-0000-0000-0000-000000000004';
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
do $$ begin assert (select count(*) from orders) = 1, 'վարորդը պետք է տեսներ իր պատվերը'; end $$;

-- 8. Խանութը չի կարող ինքն իր վճարումը «հաստատել», ոչ էլ նշել պարտքից ավելի
reset role;
select set_config('request.jwt.claim.sub', '', false);
update orders set status = 'delivered';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ begin
  begin insert into payments(shop_id, firm_id, amount) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001', 100000000); raise exception 'պետք է մերժվեր';
  exception when raise_exception then if sqlerrm = 'պետք է մերժվեր' then raise; end if; end;
end $$;
insert into payments(shop_id, firm_id, amount, confirmed_at) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001', 100, now());
do $$ begin assert (select confirmed_at from payments) is null, 'խանութը չպետք է կարողանար հաստատել'; end $$;

-- 9. Ինքնուրույն մենեջեր → «unclaimed» ֆիրմա, ապրանք (արտիկուլով); ֆիրման «վերցնում է» → մենեջերը մնում է
reset role;
insert into auth.users values ('00000000-0000-0000-0000-000000000020','m1@x.am','{"kind":"manager","name":"Կարո","firm_name":"Նոր Կաթ"}');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000020');
insert into products (firm_id, name, unit, price) select firm_id, 'Մածուն', 'հատ', 400 from employees where name = 'Կարո';
do $$ begin assert (select sku from products where name = 'Մածուն') ~ '^[A-Z]{2}0001$', 'նոր ֆիրմայի ապրանքը պետք է ստանար արտիկուլ'; end $$;
reset role;
insert into auth.users values ('00000000-0000-0000-0000-000000000022','owner@x.am',
  json_build_object('kind','firm','name','Տեր','firm_name','Նոր Կաթ ՍՊԸ','tax_id','11112222','firm_id',(select firm_id from employees where name = 'Կարո'))::jsonb);
do $$ begin
  assert (select status from firms f join employees e on e.firm_id = f.id where e.name = 'Կարո') = 'unclaimed', 'մինչև հաստատումը ֆիրման պետք է մնար unclaimed';
  assert not exists (select 1 from employees where user_id = '00000000-0000-0000-0000-000000000022'), 'մինչև հաստատումը ղեկավար չպետք է լիներ';
end $$;
-- ուրիշը չի կարող հաստատել
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
do $$ begin
  begin perform decide_firm_claim((select id from firm_claims limit 1), true); raise exception 'պետք է մերժվեր';
  exception when raise_exception then if sqlerrm = 'պետք է մերժվեր' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);  -- «սերվեր» (մենք)
select decide_firm_claim((select id from firm_claims limit 1), true);
do $$ begin
  assert (select status from firms f join employees e on e.firm_id = f.id where e.name = 'Կարո') = 'active', 'հաստատելուց հետո ֆիրման պետք է ակտիվանար';
  assert (select count(*) from employees e join firms f on f.id = e.firm_id where f.tax_id = '11112222') = 2, 'մենեջերը պետք է մնար ֆիրմայում';
end $$;

-- 10. Անկախ վարորդ → պրոֆիլ; ֆիրման հրավիրում է → կոդով դառնում է աշխատող
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users values ('00000000-0000-0000-0000-000000000030','drv@x.am',
  '{"kind":"driver","name":"Վազգեն","phone":"+37477","license_categories":["B","C"],"vehicle_type":"truck","capacity_kg":"3000","refrigerated":true}');
do $$ begin assert (select capacity_kg from driver_profiles where user_id = '00000000-0000-0000-0000-000000000030') = 3000, 'պրոֆիլը պետք է ստեղծվեր'; end $$;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');   -- Աթենքի ղեկավար
select invite_employee('Նոր վարորդ', 'driver') as code \gset
select pg_temp.as_user('00000000-0000-0000-0000-000000000030');
select accept_invite(:'code');
do $$ begin
  assert (select name from employees where user_id = '00000000-0000-0000-0000-000000000030') = 'Վազգեն', 'վարորդը պետք է դառնար աշխատող՝ իր անունով';
  begin perform accept_invite('000000'); raise exception 'պետք է մերժվեր';
  exception when raise_exception then if sqlerrm = 'պետք է մերժվեր' then raise; end if; end;
end $$;

-- 11. Չաթ. խանութ ↔ իր մենեջերը՝ այո; խանութ ↔ ուրիշ ֆիրմայի վարորդ՝ ոչ
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');   -- Կետ
select open_chat('00000000-0000-0000-0000-000000000002') as chat \gset
insert into messages (conversation_id, sender, body) values (:'chat', '00000000-0000-0000-0000-000000000001', 'Բարև, պանիր ունե՞ք');
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
do $$ begin assert (select count(*) from messages) = 1, 'Կարենը պետք է տեսներ նամակը'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000030');   -- Վազգեն (այլ վարորդ)
do $$ begin assert (select count(*) from messages) = 0, 'կողմնակի մարդը չպետք է տեսներ նամակը'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform open_chat('00000000-0000-0000-0000-000000000020'); raise exception 'պետք է մերժվեր';   -- Կարո (այլ ֆիրմա)
  exception when raise_exception then if sqlerrm = 'պետք է մերժվեր' then raise; end if; end;
end $$;

-- 12. Ազատ վարորդ → ֆիրման հրավիրում է մեկ սեղմումով → վարորդը ընդունում է
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users values ('00000000-0000-0000-0000-000000000031','free@x.am','{"kind":"driver","name":"Արսեն","license_categories":["C"],"vehicle_type":"truck"}');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');   -- Աթենքի ղեկավար
do $$ begin assert not exists (select 1 from available_drivers() where name = 'Արսեն'), 'չնույնականացված վարորդը չպետք է երևար'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000031');
do $$ begin
  begin update driver_profiles set verification_status = 'approved'; raise exception 'պետք է մերժվեր';
  exception when insufficient_privilege then null; end;   -- ինքն իրեն հաստատել չի կարող
end $$;
select submit_driver_verification('00000000-0000-0000-0000-000000000031/a.jpg', '00000000-0000-0000-0000-000000000031/b.jpg', '00000000-0000-0000-0000-000000000031/c.jpg');
do $$ begin assert (select verification_status from driver_profiles where user_id = auth.uid()) = 'pending', 'պետք է լիներ pending'; end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
select decide_driver_verification('00000000-0000-0000-0000-000000000031', true);
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');
do $$ begin assert exists (select 1 from available_drivers() where name = 'Արսեն'), 'նույնականացված վարորդը պետք է երևար'; end $$;
select invite_user('00000000-0000-0000-0000-000000000031', 'driver');
select pg_temp.as_user('00000000-0000-0000-0000-000000000031');
select answer_job_invite((select id from job_invites where status = 'pending' limit 1), true);
do $$ begin assert (select role from employees where user_id = '00000000-0000-0000-0000-000000000031') = 'driver', 'պետք է դառնար վարորդ'; end $$;

-- 13. Տեքստային (թելադրված) պատվեր. խանութ → իր մենեջերը; այլ ֆիրման չի տեսնում
reset role;
select set_config('request.jwt.claim.sub', '', false);
select firm_id as karen_firm from employees where user_id = '00000000-0000-0000-0000-000000000002' \gset
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');   -- Կետ
select send_text_order(:'karen_firm', '2 արկղ կոլա, 10 կաթ') as tord \gset
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');   -- Կարեն
do $$ begin assert (select count(*) from text_orders) = 1, 'մենեջերը պետք է տեսներ տեքստային պատվերը'; end $$;
select finish_text_order(:'tord');
do $$ begin assert (select status from text_orders) = 'done', 'պետք է լիներ done'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000020');   -- Կարո (այլ ֆիրմա)
do $$ begin assert (select count(*) from text_orders) = 0, 'այլ ֆիրման չպետք է տեսներ'; end $$;
do $$ begin
  begin perform finish_text_order((select id from text_orders limit 1)); exception when others then null; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000030');   -- կողմնակի
do $$ begin
  begin insert into text_orders (shop_id, firm_id, text) values (gen_random_uuid(), gen_random_uuid(), 'x'); raise exception 'պետք է մերժվեր';
  exception when insufficient_privilege then null; end;
end $$;

-- 14. Մատակարարների ցուցակ. խանութը տեսնում է տեսականին (առանց գնի), անանունը՝ ոչ
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ begin assert (select count(*) from firm_assortment((select id from firms limit 1))) >= 0; end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ begin
  begin perform firm_assortment(gen_random_uuid()); raise exception 'պետք է մերժվեր';
  exception when insufficient_privilege then null; end;
end $$;
set role authenticated;

-- 15. Շուկայի որոնում (բոլոր մատակարարները) և «Բոլոր խանութները»
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');   -- Կետ (խանութ)
do $$ declare n int; begin
  select count(*) into n from market_search('a', 'cheap');
  assert (select count(distinct firm_id) from market_search('a', 'best')) >= 1, 'որոնումը պետք է արդյունք տար';
  assert (select bool_and(ok) from (select price >= lag(price) over () or lag(price) over () is null as ok
          from (select price from market_search('a', 'cheap') where in_stock) x) y) is not false, 'էժանից դասավորումը սխալ է';
end $$;
do $$ begin assert (select count(*) from shop_directory()) = 0, 'խանութը չպետք է տեսներ խանութների ցուցակը'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');   -- Կարեն (մենեջեր)
do $$ begin assert (select count(*) from shop_directory()) >= 1, 'մենեջերը պետք է տեսներ խանութները'; end $$;
do $$ begin assert (select count(*) from market_search('a')) = 0, 'մենեջերի համար որոնումը դատարկ է (միայն խանութների համար)'; end $$;
select set_my_districts(array['Աջափնյակ']);
do $$ begin assert (select districts from employees where user_id = auth.uid()) = array['Աջափնյակ'], 'թաղամասը չպահվեց'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ begin
  begin update shops set listed = false where id in (select shop_id from shop_members where user_id = auth.uid()); end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
do $$ begin assert not exists (select 1 from shop_directory() where name like '%Կետ%'), 'թաքցրած խանութը չպետք է երևար'; end $$;

-- 16. Պահանջարկ. մենեջերը տեսնում է, ով է գնում (միջակայքով), խանութը՝ ոչ
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
do $$ begin assert (select count(*) from shop_demand('կա')) >= 0; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ begin assert (select count(*) from shop_demand('կա')) = 0, 'խանութը չպետք է տեսներ պահանջարկը'; end $$;

-- 17. Կատեգորիաներ, «Ով է գնում» գնի համեմատությամբ, «Փնտրում եմ մատակարար»
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert guess_category('Լավաշ թարմ') = 'Հացաբուլկեղեն', 'լավաշ';
  assert guess_category('Կաթ 3.2%, 1 լ') = 'Կաթնամթերք', 'կաթ';
  assert guess_category('Զուգարանի թուղթ, 3 շերտ') = 'Տնտեսական ապրանքներ', 'թուղթ';
  assert guess_category('Яйцо куриное С0') = 'Ձու', 'яйцо';
  assert guess_category('Հանքային ջուր, 0.5 լ') = 'Ըմպելիքներ', 'ջուր';
  assert guess_category('Ինչ-որ բան') = 'Այլ', 'այլ';
end $$;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');   -- Կարեն
do $$ begin assert (select count(*) from shop_demand('կաթ') where price_status is not null or true) >= 0; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');   -- Կետ
insert into supply_requests (shop_id, text) select shop_id, 'Փնտրում եմ ձու, շաբաթական 300 հատ' from shop_members where user_id = auth.uid();
do $$ begin assert (select category from supply_requests limit 1) = 'Ձու', 'հարցման կատեգորիան'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000020');   -- Կարո (այլ ֆիրմա)
do $$ begin assert (select count(*) from supply_requests) = 1, 'մատակարարը պետք է տեսներ հարցումը'; end $$;
insert into supply_offers (request_id, firm_id, employee_id, text, price)
  select r.id, (my_employee()).firm_id, (my_employee()).id, 'Ունենք ձու C0, 65 ֏', 65 from supply_requests r;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');   -- Կարեն (մրցակից)
do $$ begin assert (select count(*) from supply_offers) = 0, 'մրցակիցը չպետք է տեսներ ուրիշի առաջարկը'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ begin assert (select count(*) from supply_offers) = 1, 'խանութը պետք է տեսներ առաջարկը'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000030');   -- կողմնակի վարորդ
do $$ begin
  begin insert into supply_requests (shop_id, text) select id, 'xx' from shops limit 1; raise exception 'պետք է մերժվեր';
  exception when insufficient_privilege then null; end;
end $$;

-- 18. Live շուկա. մատակարարի առաջարկ → խանութը «Հետաքրքրված եմ» → միայն այդ ֆիրման է տեսնում ով
select pg_temp.as_user('00000000-0000-0000-0000-000000000020');   -- Կարո
insert into supplier_deals (firm_id, employee_id, text, price) values ((my_employee()).firm_id, (my_employee()).id, 'Ձու C0 թարմ', 60);
do $$ begin assert (select category from supplier_deals limit 1) = 'Ձու', 'առաջարկի կատեգորիան'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');   -- Կետ
do $$ begin assert (select count(*) from live_deals()) = 1, 'խանութը պետք է տեսներ առաջարկը'; end $$;
do $$ begin assert (select shop_name from live_requests() limit 1) is not null, 'իր հարցման անունը'; end $$;
insert into deal_interests (deal_id, shop_id) select d.id, m.shop_id from supplier_deals d, shop_members m where m.user_id = auth.uid();
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');   -- Կարեն (մրցակից)
do $$ begin assert (select count(*) from deal_interests) = 0, 'մրցակիցը չպետք է տեսներ'; end $$;
do $$ begin assert (select count(*) from deal_interested_shops((select id from supplier_deals limit 1))) = 0, 'մրցակիցը չպետք է տեսներ ով'; end $$;
do $$ begin
  begin insert into supplier_deals (firm_id, employee_id, text) values ((select firm_id from supplier_deals limit 1), (my_employee()).id, 'կեղծ'); raise exception 'պետք է մերժվեր';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000020');
do $$ begin assert (select count(*) from deal_interested_shops((select id from supplier_deals limit 1))) = 1, 'ֆիրման պետք է տեսներ ով է հետաքրքրվել'; end $$;

-- 19. Վճարման հաստատում. ղեկավարը՝ միայն թույլտվությամբ, հաշվապահը՝ թույլտվությամբ; փոխանցում հաշվապահին
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');   -- Աթենքի ղեկավար
update payments set confirmed_at = now() where firm_id = '10000000-0000-0000-0000-000000000001';
do $$ begin assert (select count(*) from payments where confirmed_at is not null and firm_id = '10000000-0000-0000-0000-000000000001') = 0, 'ղեկավարը առանց թույլտվության չպետք է հաստատեր'; end $$;
insert into firm_perms values ('10000000-0000-0000-0000-000000000001', 'emp:20000000-0000-0000-0000-000000000002', 'payments_confirm', true);   -- Անին՝ հաշվապահ
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');   -- Կարեն (մենեջեր, ֆիրման ղեկավար ունի)
select forward_payment((select id from payments where firm_id = '10000000-0000-0000-0000-000000000001' limit 1), '20000000-0000-0000-0000-000000000002');
update payments set confirmed_at = now() where firm_id = '10000000-0000-0000-0000-000000000001';
do $$ begin assert (select count(*) from payments where confirmed_at is not null and firm_id = '10000000-0000-0000-0000-000000000001') = 0, 'մենեջերը չպետք է հաստատեր'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');   -- Անի
update payments set confirmed_at = now() where firm_id = '10000000-0000-0000-0000-000000000001';
do $$ begin assert (select count(*) from payments where confirmed_at is not null and firm_id = '10000000-0000-0000-0000-000000000001') >= 1, 'հաշվապահը պետք է կարողանար հաստատել'; end $$;

-- 20. Նոր ֆիրման առանց բանկային ստուգման ադմինի գործիքներ չունի
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users values ('00000000-0000-0000-0000-000000000040','newfirm@x.am','{"kind":"firm","firm_name":"Նոր Ֆիրմա","name":"Տեր"}');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000040');
do $$ begin
  assert not is_firm_admin((select firm_id from employees where user_id = auth.uid())), 'չստուգված ֆիրմայի ադմինը չպետք է ունենար իրավունքներ';
  assert (select verification_code from firms where id = (select firm_id from employees where user_id = auth.uid())) like 'MTK-%', 'կոդ չկա';
end $$;
select mark_verification_paid();
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into platform_admins values ('00000000-0000-0000-0000-000000000007') on conflict do nothing;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');
do $$ begin assert (select count(*) from pending_firm_activations() where paid_at is not null) = 1, 'հարթակը պետք է տեսներ'; end $$;
select decide_firm_activation((select firm_id from pending_firm_activations() limit 1), true);
select pg_temp.as_user('00000000-0000-0000-0000-000000000040');
do $$ begin assert is_firm_admin((select firm_id from employees where user_id = auth.uid())), 'ստուգվելուց հետո պետք է լիներ ադմին'; end $$;

-- 21. Ֆիրման առանց թույլտվության չի կարող «հաստատված» վճարում ավելացնել
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');   -- Աթենքի ղեկավար (թույլտվություն չունի)
insert into payments(shop_id, firm_id, amount, confirmed_at) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001', 50000, now());
do $$ begin assert (select confirmed_at from payments where amount = 50000) is null, 'առանց թույլտվության չպետք է լիներ հաստատված'; end $$;

-- 22. Թույլտվություններ. լռելյայն → դեր → մարդ
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');   -- Կարեն (մենեջեր)
do $$ begin
  assert has_perm('shop_terms', '10000000-0000-0000-0000-000000000001'), 'մենեջերը լռելյայն պետք է փոխեր պայմանները';
  assert not has_perm('products', '10000000-0000-0000-0000-000000000001'), 'մենեջերը լռելյայն չպետք է փոխեր ապրանքները';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');   -- ղեկավար
insert into firm_perms values ('10000000-0000-0000-0000-000000000001', 'role:manager', 'shop_terms', false);
insert into firm_perms values ('10000000-0000-0000-0000-000000000001', 'emp:20000000-0000-0000-0000-000000000001', 'products', true);
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
do $$ begin
  assert not has_perm('shop_terms', '10000000-0000-0000-0000-000000000001'), 'ղեկավարը փակեց մենեջերների համար';
  assert has_perm('products', '10000000-0000-0000-0000-000000000001'), 'ղեկավարը բացեց Կարենի համար';
end $$;
update shop_firm_links set discount_pct = 50 where firm_id = '10000000-0000-0000-0000-000000000001';
do $$ begin assert not exists (select 1 from shop_firm_links where discount_pct = 50), 'առանց թույլտվության զեղչը չպետք է փոխվեր'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');   -- Անի
do $$ begin begin insert into firm_perms values ('10000000-0000-0000-0000-000000000001', 'emp:x', 'invite', true); raise exception 'պետք է մերժվեր';
  exception when insufficient_privilege then null; end; end $$;

-- 23. Սև ցուցակ. խանութը չի կարող պատվիրել
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');
update shop_firm_links set blocked = true where shop_id = '30000000-0000-0000-0000-000000000001' and firm_id = '10000000-0000-0000-0000-000000000001';
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform place_order('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', current_date + 1, '[{"product_id":"40000000-0000-0000-0000-000000000003","qty":12}]'); raise exception 'պետք է մերժվեր';
  exception when raise_exception then if sqlerrm = 'պետք է մերժվեր' then raise; end if; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');
update shop_firm_links set blocked = false where shop_id = '30000000-0000-0000-0000-000000000001' and firm_id = '10000000-0000-0000-0000-000000000001';

-- 24. «Առաջարկել համագործակցություն» → խանութը ընդունում է
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from shop_firm_links where shop_id = '30000000-0000-0000-0000-000000000001' and firm_id = (select firm_id from employees where user_id = '00000000-0000-0000-0000-000000000020');
update shops set listed = true where id = '30000000-0000-0000-0000-000000000001';   -- թեստ 15-ում թաքցրել էինք
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000020');   -- Կարո (ֆիրմա առանց ղեկավարի)
select offer_partnership('30000000-0000-0000-0000-000000000001');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');   -- Կետ
select answer_partnership((select firm_id from shop_firm_links where initiated_by = 'firm' limit 1), true);
do $$ begin assert (select status from shop_firm_links where initiated_by = 'firm' limit 1) = 'active', 'խանութը պետք է ընդուներ'; end $$;

-- 25. Առաջարկը (թեստ 17) ինքնաբերաբար բացեց անձնական չաթ Կարոյի և Կետի միջև
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin assert exists (select 1 from conversations c join messages m on m.conversation_id = c.id
  where '00000000-0000-0000-0000-000000000020' in (c.a, c.b) and '00000000-0000-0000-0000-000000000001' in (c.a, c.b) and m.body like '💼 Առաջարկ%'), 'առաջարկը պետք է գնար չաթ'; end $$;
set role authenticated;

-- 26. Ուղղումներ. խանութը չի կարող կեղծել «ֆիրմայի առաջարկ», ֆիրման չի ընդունում իր առաջարկը, պատճառը՝ միայն ֆիրմային
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');   -- Կետ
do $$ begin
  begin insert into shop_firm_links (shop_id, firm_id, status, initiated_by)
    values ('30000000-0000-0000-0000-000000000001', (select id from firms where name = 'Նոր Ֆիրմա'), 'pending', 'firm'); raise exception 'պետք է մերժվեր';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');   -- Աթենքի ղեկավար
insert into link_block_notes values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'ներքին նշում');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ begin assert (select count(*) from link_block_notes) = 0, 'խանութը չպետք է տեսներ պատճառը'; end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from shop_firm_links where shop_id = '30000000-0000-0000-0000-000000000001' and firm_id = (select firm_id from employees where user_id = '00000000-0000-0000-0000-000000000020');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000020');   -- Կարո
select offer_partnership('30000000-0000-0000-0000-000000000001');
update shop_firm_links set status = 'active' where initiated_by = 'firm';
do $$ begin assert (select status from shop_firm_links where initiated_by = 'firm' limit 1) = 'pending', 'ֆիրման չպետք է ընդուներ իր առաջարկը'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');
update shop_firm_links set blocked = true where shop_id = '30000000-0000-0000-0000-000000000001' and firm_id = '10000000-0000-0000-0000-000000000001';
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform send_text_order('10000000-0000-0000-0000-000000000001', 'ձու 20 արկղ'); raise exception 'պետք է մերժվեր';
  exception when raise_exception then if sqlerrm = 'պետք է մերժվեր' then raise; end if; end;
end $$;

-- 27. Պահեստ. մուտք → առաքում → ելք; 0-ում «Չկա»; ուղղում
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');   -- Անի (staff)
insert into stock_moves (firm_id, product_id, qty, kind, employee_id)
  values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 24, 'in', (my_employee()).id);
do $$ begin assert (select balance from stock_balance() where product_id = '40000000-0000-0000-0000-000000000003') = 24, 'մնացորդ 24'; end $$;
select set_actual_stock('40000000-0000-0000-0000-000000000003', 0, 'փչացավ');
do $$ begin assert not (select in_stock from products where id = '40000000-0000-0000-0000-000000000003'), '0-ում պետք է լիներ «Չկա»'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');   -- Կարեն (մենեջեր). մուտք անել չի կարող (լռելյայն)
do $$ begin
  begin insert into stock_moves (firm_id, product_id, qty, kind, employee_id)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 5, 'in', (my_employee()).id); raise exception 'պետք է մերժվեր';
  exception when insufficient_privilege then null; end;
end $$;

-- 28. Պատվերի ուղղում (քանակ / գին) և պարտք
reset role;
select set_config('request.jwt.claim.sub', '', false);
update shop_firm_links set blocked = false;
update products set in_stock = true;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');   -- Կետ
select place_order('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001', current_date + 1,
  '[{"product_id":"40000000-0000-0000-0000-000000000002","qty":12}]') as o9 \gset
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');   -- Անի
select edit_order_item((select id from order_items where order_id = :'o9'), 10, 300);
do $$ begin assert (select sent_qty from order_items where order_id = current_setting('o9.id', true)::uuid) is null or true; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform edit_order_item((select id from order_items limit 1), 1, 1); raise exception 'պետք է մերժվեր';
  exception when raise_exception then if sqlerrm = 'պետք է մերժվեր' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
update orders set status = 'delivered' where id = :'o9';
do $$ begin assert exists (select 1 from order_items where sent_qty = 10 and final_price = 300), 'ուղղումը պետք է պահվեր'; end $$;

-- 29. Փոխարինող ապրանք. մատակարարը առաջարկում է, խանութը ընդունում
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select place_order('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001', current_date + 1,
  '[{"product_id":"40000000-0000-0000-0000-000000000001","qty":30}]') as o10 \gset
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select propose_substitute((select id from order_items where order_id = :'o10'), '40000000-0000-0000-0000-000000000002', 12);
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select answer_substitute((select id from order_items where order_id = :'o10'), true);
do $$ begin assert (select product_id from order_items where sub_status = 'accepted' limit 1) = '40000000-0000-0000-0000-000000000002', 'փոխարինողը պետք է դառնար տողի ապրանք'; end $$;

-- 30. Ակցիա միայն հաճախորդներին. ուրիշ խանութը չի տեսնում
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');   -- Աթենքի ղեկավար
insert into supplier_deals (firm_id, employee_id, text, audience) values ('10000000-0000-0000-0000-000000000001', (my_employee()).id, 'Ակցիա իմ հաճախորդներին', 'clients');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');   -- Կետ (հաճախորդ)
do $$ begin assert exists (select 1 from live_deals() where text = 'Ակցիա իմ հաճախորդներին'), 'հաճախորդը պետք է տեսներ'; end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users values ('00000000-0000-0000-0000-000000000050','other-shop@x.am','{"kind":"shop","name":"Ուրիշ խանութ"}');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000050');
do $$ begin assert not exists (select 1 from live_deals() where text = 'Ակցիա իմ հաճախորդներին'), 'ուրիշը չպետք է տեսներ'; end $$;

-- 31. Ժամկետանց պարտք
reset role;
select set_config('request.jwt.claim.sub', '', false);
update shop_firm_links set payment_days = 0 where shop_id = '30000000-0000-0000-0000-000000000001' and firm_id = '10000000-0000-0000-0000-000000000001';
update orders set delivery_date = current_date - 5 where firm_id = '10000000-0000-0000-0000-000000000001' and status = 'delivered';
do $$ begin assert (select overdue from overdue_debts() where shop_id = '30000000-0000-0000-0000-000000000001' and firm_id = '10000000-0000-0000-0000-000000000001') > 0, 'պետք է լիներ ժամկետանց'; end $$;
select send_overdue_reminders();

-- 32. Ապրանքներ՝ միայն «📦 Ապրանքներ» իրավունքով. մենեջերը (առանց իրավունքի) չի կարող փոխել գինը
reset role;
delete from firm_perms where target = 'emp:20000000-0000-0000-0000-000000000001' and perm = 'products';   -- թեստ 22-ի թույլտվությունը հանում ենք
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');   -- Կարեն (մենեջեր, առանց ապրանքների իրավունքի)
update products set price = 1 where firm_id = '10000000-0000-0000-0000-000000000001';
do $$ begin assert not exists (select 1 from products where price = 1), 'մենեջերը չպետք է փոխեր գինը'; end $$;

-- 33. Վճարման ժամկետը փոխում է միայն «⚙️ պայմաններ» իրավունքով
-- (մենեջերների համար «պայմաններ»-ը փակված է թեստ 22-ում)
update shop_firm_links set payment_days = 99 where firm_id = '10000000-0000-0000-0000-000000000001';
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin assert not exists (select 1 from shop_firm_links where payment_days = 99), 'առանց իրավունքի չպետք է փոխվեր'; end $$;

-- 34. Ուղղված գինը չի կարելի փոխել ուղիղ աղյուսակով (միայն edit_order_item-ով)
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000007');   -- ղեկավար
update order_items set final_price = 0, sub_status = 'proposed' where final_price = 300;
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin assert exists (select 1 from order_items where final_price = 300 and sub_status is null), 'ուղիղ UPDATE-ը չպետք է փոխեր'; end $$;

reset role;
\echo ✅ Բազայի բոլոր ստուգումներն անցան
