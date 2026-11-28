-- Մաքրում է ՄԻԱՅՆ t-*@demo.matakarar.com հաշիվների և «Թեստ …» տվյալները
create temp table tu as select id from auth.users where email like 't-%@demo.matakarar.com';
create temp table ts as select shop_id id from shop_members where user_id in (select id from tu)
  union select id from shops where name like 'Թեստ խանութ%';
create temp table tf as select firm_id id from employees where user_id in (select id from tu) and role = 'admin'
  and firm_id not in ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003');
create temp table te as select id from employees where firm_id in (select id from tf) or user_id in (select id from tu);
delete from orders where shop_id in (select id from ts) or firm_id in (select id from tf);
delete from payments where shop_id in (select id from ts) or firm_id in (select id from tf);
delete from job_invites where invited_by in (select id from te);
delete from shop_firm_links where shop_id in (select id from ts) or firm_id in (select id from tf);
delete from supply_requests where shop_id in (select id from ts);
delete from shops where id in (select id from ts);
update employees set default_forward_to = null where default_forward_to in (select id from te);
delete from employees where id in (select id from te);
delete from firms where id in (select id from tf);
delete from employees where invite_code is not null and name like 'Թեստ%';
delete from auth.users where id in (select id from tu);
