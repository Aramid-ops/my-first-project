-- Պատվերի տողի ուղղված քանակը / գինը / փոխարինումը փոխվում են ՄԻԱՅՆ RPC-ներով (edit_order_item, propose_substitute, answer_substitute),
-- ոչ թե ուղիղ աղյուսակով (այլապես վարորդը կամ առանց իրավունքի աշխատողը կարող էր փոխել գինը առաքումից հետո)
create or replace function order_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p products;
  o orders;
  k numeric;
begin
  if tg_op = 'UPDATE' and current_setting('app.order_edit', true) = 'on' then return new; end if;
  select * into o from orders where id = new.order_id;
  select * into p from products where id = new.product_id;
  if p.id is null or o.id is null or p.firm_id <> o.firm_id then
    raise exception 'Ապրանքը չի պատկանում այս մատակարարին';
  end if;
  if tg_op = 'INSERT' then
    if not p.in_stock then raise exception 'Ապրանքը առկա չէ. %', p.name; end if;
    if new.qty < p.min_qty then raise exception 'Նվազագույն քանակը՝ % %', trim_scale(p.min_qty), p.unit; end if;
    k := (new.qty - p.min_qty) / p.step;
    if k <> trunc(k) then raise exception 'Քանակը պետք է լինի % քայլով', trim_scale(p.step); end if;
    new.price := price_for(o.shop_id, p.id);
    new.sent_qty := null; new.final_price := null;
    new.sub_product_id := null; new.sub_qty := null; new.sub_status := null;
  else
    new.price := old.price;
    new.product_id := old.product_id;
    new.order_id := old.order_id;
    new.sent_qty := old.sent_qty;
    new.final_price := old.final_price;
    new.sub_product_id := old.sub_product_id;
    new.sub_qty := old.sub_qty;
    new.sub_status := old.sub_status;
  end if;
  return new;
end $$;
revoke execute on function order_items_guard() from public, anon, authenticated;

-- RPC-ները աշխատում են դրոշով
create or replace function edit_order_item(p_item uuid, p_sent_qty numeric, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  i order_items := (select i from order_items i where i.id = p_item);
  o orders := (select o from orders o where o.id = i.order_id);
  pname text := (select name from products where id = i.product_id);
  parts text[] := '{}';
begin
  if i.id is null or not can_edit_order(o) then raise exception 'Թույլտվություն չունեք'; end if;
  if p_sent_qty is not null and p_sent_qty < 0 or p_price is not null and p_price < 0 then raise exception 'Սխալ արժեք'; end if;
  perform set_config('app.order_edit', 'on', true);
  update order_items set sent_qty = p_sent_qty, final_price = p_price where id = p_item;
  perform set_config('app.order_edit', 'off', true);
  if p_sent_qty is not null and p_sent_qty <> i.qty then parts := parts || (trim_scale(i.qty)::text || ' → ' || trim_scale(p_sent_qty)::text); end if;
  if p_price is not null and p_price <> i.price then parts := parts || (trim_scale(i.price)::text || ' → ' || trim_scale(p_price)::text || ' ֏'); end if;
  if cardinality(parts) > 0 then
    insert into order_events (order_id, actor_name, text) values (o.id, '', '✏️ ' || pname || '. ' || array_to_string(parts, ', '));
    perform push_to_users(array(select user_id from shop_members where shop_id = o.shop_id),
      '✏️ ' || (select name from firms where id = o.firm_id), pname || '. ' || array_to_string(parts, ', '), jsonb_build_object('orderId', o.id));
  end if;
end $$;

create or replace function propose_substitute(p_item uuid, p_product uuid, p_qty numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  i order_items := (select i from order_items i where i.id = p_item);
  o orders := (select o from orders o where o.id = i.order_id);
begin
  if i.id is null or not can_edit_order(o) then raise exception 'Թույլտվություն չունեք'; end if;
  if not exists (select 1 from products where id = p_product and firm_id = o.firm_id and in_stock) then raise exception 'Փոխարինողը առկա չէ'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Նշեք քանակը'; end if;
  perform set_config('app.order_edit', 'on', true);
  update order_items set sub_product_id = p_product, sub_qty = p_qty, sub_status = 'proposed' where id = p_item;
  perform set_config('app.order_edit', 'off', true);
  insert into order_events (order_id, actor_name, text) values (o.id, '',
    '🔄 Առաջարկում է փոխարինել. ' || (select name from products where id = i.product_id) || ' → ' || (select name from products where id = p_product) || ' × ' || trim_scale(p_qty)::text);
  perform push_to_users(array(select user_id from shop_members where shop_id = o.shop_id),
    '🔄 ' || (select name from firms where id = o.firm_id), 'Առաջարկում է փոխարինող ապրանք. հաստատեք', jsonb_build_object('orderId', o.id));
end $$;

create or replace function answer_substitute(p_item uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  i order_items := (select i from order_items i where i.id = p_item);
  o orders := (select o from orders o where o.id = i.order_id);
begin
  if i.id is null or i.sub_status <> 'proposed' or not is_shop_member(o.shop_id) then raise exception 'Չի գտնվել'; end if;
  if not exists (select 1 from products where id = i.sub_product_id and firm_id = o.firm_id) then raise exception 'Չի գտնվել'; end if;
  perform set_config('app.order_edit', 'on', true);
  if p_accept then
    update order_items set product_id = i.sub_product_id, qty = i.sub_qty, sent_qty = null, final_price = null,
      price = price_for(o.shop_id, i.sub_product_id), sub_status = 'accepted' where id = p_item;
  else
    update order_items set sub_status = 'rejected' where id = p_item;
  end if;
  perform set_config('app.order_edit', 'off', true);
  insert into order_events (order_id, actor_name, text) values (o.id, '', case when p_accept then '✅ Խանութը ընդունեց փոխարինումը' else '❌ Խանութը մերժեց փոխարինումը' end);
  perform push_to_users(array(select user_id from employees where id in (o.manager_id, o.assignee_id) and user_id is not null),
    (select name from shops where id = o.shop_id), case when p_accept then '✅ Ընդունեց փոխարինումը' else '❌ Մերժեց փոխարինումը' end, jsonb_build_object('orderId', o.id));
end $$;
