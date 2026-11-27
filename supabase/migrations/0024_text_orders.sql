-- Տեքստային (թելադրված) պատվեր. խանութը գրում կամ ձայնով թելադրում է (հեռախոսի ստեղնաշարի 🎤),
-- ստուգում է տեքստը և ուղարկում իր մենեջերին։ Մենեջերը դրանով ստեղծում է իսկական պատվերը։

create table text_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops (id) on delete cascade,
  firm_id uuid not null references firms (id) on delete cascade,
  manager_id uuid references employees (id) on delete set null,
  text text not null check (length(trim(text)) between 1 and 2000),
  status text not null default 'new' check (status in ('new', 'done')),
  created_at timestamptz not null default now()
);
create index text_orders_shop_idx on text_orders (shop_id);
create index text_orders_firm_idx on text_orders (firm_id, status);
create index text_orders_manager_idx on text_orders (manager_id);

alter table text_orders enable row level security;
-- Կարդալ. խանութը՝ իրենը, ֆիրմայի աշխատողները՝ իրենց ֆիրմայինը
create policy text_orders_read on text_orders for select to authenticated using (
  is_shop_member(shop_id) or firm_id = (select (my_employee()).firm_id)
);
grant select on text_orders to authenticated;
-- Գրել միայն ֆունկցիաներով (ներքևում)

create or replace function send_text_order(p_firm uuid, p_text text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := (select shop_id from shop_members where user_id = auth.uid() limit 1);
  l shop_firm_links;
  tid uuid;
begin
  select * into l from shop_firm_links where shop_id = sid and firm_id = p_firm and status = 'active';
  if l.shop_id is null then raise exception 'Դուք միացած չեք այս մատակարարին'; end if;
  if length(trim(coalesce(p_text, ''))) = 0 then raise exception 'Պատվերը դատարկ է'; end if;
  insert into text_orders (shop_id, firm_id, manager_id, text)
    values (sid, p_firm, l.manager_id, trim(p_text)) returning id into tid;
  perform push_to_users(
    array(select user_id from employees where id = l.manager_id and user_id is not null),
    '📝 ' || (select name from shops where id = sid),
    left(trim(p_text), 120), jsonb_build_object('textOrderId', tid));
  return tid;
end $$;

create or replace function finish_text_order(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update text_orders set status = 'done'
   where id = p_id and firm_id = (select (my_employee()).firm_id);
  if not found then raise exception 'Չի գտնվել'; end if;
end $$;

revoke execute on function send_text_order(uuid, text) from public, anon;
revoke execute on function finish_text_order(uuid) from public, anon;
grant execute on function send_text_order(uuid, text) to authenticated;
grant execute on function finish_text_order(uuid) to authenticated;

alter publication supabase_realtime add table text_orders;
