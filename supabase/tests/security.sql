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

-- 8. Խանութը չի կարող ինքն իր վճարումը «հաստատել»
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into payments(shop_id, firm_id, amount, confirmed_at) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001', 1000, now());
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

reset role;
\echo ✅ Բազայի բոլոր ստուգումներն անցան
