delete from shops where id in (select shop_id from shop_members sm join auth.users u on u.id=sm.user_id where u.email like 't-%@demo.matakarar.com');
delete from firms where id in (select firm_id from employees e join auth.users u on u.id=e.user_id where u.email like 't-%@demo.matakarar.com' and e.role='admin' and e.firm_id not in ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003'));
delete from employees where user_id in (select id from auth.users where email like 't-%@demo.matakarar.com');
delete from employees where invite_code is not null and name like 'Թեստ%';
delete from auth.users where email like 't-%@demo.matakarar.com';
delete from supply_requests where shop_id in (select id from shops where name like 'Թեստ խանութ%');
