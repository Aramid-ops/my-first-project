-- Անվտանգության ամրացում (code review-ից հետո)
--
-- 1. Գինը չի կարող գալ հավելվածից. order_items.price-ը միշտ վերցվում է products-ից։
-- 2. Պատվերի տողը պետք է լինի նույն ֆիրմայի ապրանք, իսկ քանակը՝ ըստ նվազագույնի և քայլի։
-- 3. Պատվերի «անփոփոխ» դաշտերը (խանութ, ֆիրմա, մենեջեր, ստեղծման ժամ) հնարավոր չէ փոխել։
-- 4. Պատմության մեջ անունը չի կարող կեղծվել. actor_name-ը լրացնում է բազան։
-- 5. Պատվերը ստեղծվում է մեկ գործողությամբ (place_order). կամ ամբողջը, կամ ոչինչ։

-- 1–2. Պատվերի տող ───────────────────────────────────────────────
create or replace function order_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p products;
  o orders;
  k numeric;
begin
  select * into o from orders where id = new.order_id;
  select * into p from products where id = new.product_id;
  if p.id is null or o.id is null or p.firm_id <> o.firm_id then
    raise exception 'Ապրանքը չի պատկանում այս մատակարարին';
  end if;
  if tg_op = 'INSERT' then
    if not p.in_stock then
      raise exception 'Ապրանքը առկա չէ. %', p.name;
    end if;
    if new.qty < p.min_qty then
      raise exception 'Նվազագույն քանակը՝ % %', p.min_qty, p.unit;
    end if;
    k := (new.qty - p.min_qty) / p.step;
    if k <> trunc(k) then
      raise exception 'Քանակը պետք է լինի % քայլով', p.step;
    end if;
    new.price := p.price;               -- գինը միշտ բազայից
  else
    new.price := old.price;             -- գինը չի փոխվում
    new.product_id := old.product_id;
    new.order_id := old.order_id;
  end if;
  return new;
end $$;

create trigger order_items_guard before insert or update on order_items
  for each row execute function order_items_guard();

-- 3. Պատվերի անփոփոխ դաշտեր ─────────────────────────────────────
create or replace function orders_guard() returns trigger
language plpgsql as $$
begin
  new.shop_id := old.shop_id;
  new.firm_id := old.firm_id;
  new.manager_id := old.manager_id;
  new.created_at := old.created_at;
  return new;
end $$;

create trigger orders_guard before update on orders
  for each row execute function orders_guard();

-- Վարորդը կարող է փոխել միայն իրեն կցված պատվերները
drop policy if exists orders_update on orders;
create policy orders_update on orders for update to authenticated using (
  firm_id = (my_employee()).firm_id
  and ((my_employee()).role <> 'driver' or driver_id = (my_employee()).id)
) with check (
  firm_id = (my_employee()).firm_id
);

-- 4. Պատմության անունը լրացնում է բազան ─────────────────────────
create or replace function order_events_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n text;
begin
  new.actor_user := auth.uid();
  select name into n from employees where user_id = auth.uid() and active limit 1;
  if n is null then
    select s.name into n from shop_members m join shops s on s.id = m.shop_id
      where m.user_id = auth.uid() limit 1;
  end if;
  new.actor_name := coalesce(n, new.actor_name, '');
  new.at := now();
  return new;
end $$;

create trigger order_events_fill before insert on order_events
  for each row execute function order_events_fill();

-- 5. Պատվերը մեկ գործողությամբ ───────────────────────────────────
-- p_items: [{"product_id": "...", "qty": 30}, ...]
-- security invoker. աշխատում է կանչողի իրավունքներով, ուրեմն RLS-ը գործում է
create or replace function place_order(p_shop uuid, p_firm uuid, p_delivery date, p_items jsonb)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  l shop_firm_links;
  oid uuid;
  it jsonb;
begin
  select * into l from shop_firm_links
    where shop_id = p_shop and firm_id = p_firm and status = 'active';
  if l.shop_id is null then
    raise exception 'Դուք կապված չեք այս մատակարարին';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Պատվերը դատարկ է';
  end if;

  insert into orders (shop_id, firm_id, manager_id, assignee_id, status, delivery_date)
    values (p_shop, p_firm, l.manager_id, l.manager_id, 'sent', p_delivery)
    returning id into oid;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into order_items (order_id, product_id, qty, price)
      values (oid, (it->>'product_id')::uuid, (it->>'qty')::numeric, 0);
  end loop;

  insert into order_events (order_id, actor_name, text) values (oid, '', 'Ուղարկեց պատվերը');
  return oid;
end $$;

grant execute on function place_order(uuid, uuid, date, jsonb) to authenticated;
revoke execute on function order_items_guard(), orders_guard(), order_events_fill() from public, anon, authenticated;
