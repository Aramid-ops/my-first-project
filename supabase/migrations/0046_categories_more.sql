-- Կատեգորիաներ. «Կոսմետիկա և հիգիենա», լրացուցիչ բանալի բառեր, ուղղագրական սխալների ճանաչում
create extension if not exists fuzzystrmatch with schema extensions;

insert into category_keywords (category, keyword)
select 'Կոսմետիկա և հիգիենա', unnest(array['մազի', 'մազերի', 'շամպուն', 'օճառ', 'ատամի', 'կրեմ', 'դեզոդորանտ', 'բալզամ',
  'տակդիր', 'հիգիենիկ', 'անձեռոցիկ խոնավ', 'սափրվելու', 'краска для волос', 'шампун', 'мыло', 'зубн', 'крем', 'дезодорант', 'подгуз', 'бальзам'])
on conflict do nothing;
insert into category_keywords (category, keyword) values
  ('Ձեթ, համեմունք, սոուս', 'բիբար'), ('Ձեթ, համեմունք, սոուս', 'դարչին'), ('Ձեթ, համեմունք, սոուս', 'համեմ'),
  ('Ձեթ, համեմունք, սոուս', 'чёрный перец'), ('Ձեթ, համեմունք, սոուս', 'корица'),
  ('Մրգեր և բանջարեղեն', 'կուկուռուզ'), ('Մրգեր և բանջարեղեն', 'եգիպտացորեն'), ('Մրգեր և բանջարեղեն', 'кукуруз'),
  ('Տնտեսական ապրանքներ', 'տոպրակ'), ('Տնտեսական ապրանքներ', 'միանգամյա'), ('Տնտեսական ապրանքներ', 'пакет')
on conflict do nothing;

-- Ուղղագրական սխալ. «Տմնտեսական» ≈ «Տնտեսական ապրանքներ» (1–2 տառի տարբերություն ամբողջ անվան կամ առաջին բառի հետ)
create or replace function normalize_category(p text) returns text
language sql stable security definer set search_path = public, extensions as $$
  with t as (select nullif(trim(regexp_replace(p, '\s+', ' ', 'g')), '') v),
  c as (
    select category c, 0 pri, 0 n from category_keywords group by category
    union all
    select category, 1, count(*) from products where category is not null group by category
  ),
  m as (   -- 0՝ նույնը, 1՝ 1–2 տառի տարբերություն (ամբողջ անվան կամ առաջին բառի հետ)
    select c.c, c.pri, c.n, case when category_key(c.c) = category_key(t.v) then 0 else 1 end dist
    from c, t
    where category_key(c.c) = category_key(t.v)
       or (length(category_key(t.v)) >= 5
           and (levenshtein(category_key(c.c), category_key(t.v)) <= 2
                or levenshtein(split_part(category_key(c.c), ' ', 1), category_key(t.v)) <= 1))
  )
  -- նախապատվություն՝ ստանդարտ կատեգորիաներին (նույնիսկ սխալ գրվածի դեպքում), հետո՝ ամենաշատ օգտագործվածին
  select case when t.v is null then null else coalesce(
    (select m.c from m order by pri, dist, n desc limit 1),
    upper(left(t.v, 1)) || substr(t.v, 2)) end
  from t
$$;

update products p set category = normalize_category(p.category) where not p.category_auto and p.category is not null;
update products set category = guess_category(name) where category_auto;

-- Ապրանքը «Կա» է դառնում միայն եթե կատեգորիան ԸՆՏՐՎԱԾ է (ոչ թե ավտոմատ գուշակված) և պահեստում քանակ կա
create or replace function products_stock_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select auth.uid()) is null then return new; end if;   -- սերվերային սկրիպտներ / seed
  if new.in_stock and (tg_op = 'INSERT' or not old.in_stock) then
    if tg_op = 'INSERT' then new.in_stock := false;
    elsif new.category_auto then raise exception 'Ընտրեք ապրանքի կատեգորիան, որ ապրանքը երևա';
    elsif coalesce((select sum(qty) from stock_moves where product_id = new.id), 0) <= 0 then
      raise exception 'Ավելացրեք քանակը պահեստում, որ ապրանքը երևա';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists products_stock_guard on products;
create trigger products_stock_guard before insert or update of in_stock on products
  for each row execute function products_stock_guard();

-- Պահեստի շարժ. 0 → «Չկա»; քանակ կա → «Կա» միայն ընտրված կատեգորիայով (այլապես՝ մնում է ինչպես կա)
create or replace function stock_moves_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  bal numeric := coalesce((select sum(qty) from stock_moves where product_id = new.product_id), 0);
  p products := (select p from products p where p.id = new.product_id);
begin
  if bal <= 0 then
    update products set in_stock = false where id = new.product_id and in_stock;
  elsif not p.category_auto then
    update products set in_stock = true where id = new.product_id and not in_stock;
  end if;
  if p.low_stock is not null and bal <= p.low_stock and bal - new.qty > p.low_stock then
    perform push_to_users(
      array(select e.user_id from employees e where e.firm_id = new.firm_id and e.active and e.user_id is not null and emp_has_perm(e.id, 'stock')),
      '⚠️ Քիչ է մնացել', p.name || '՝ ' || trim_scale(bal)::text || ' ' || p.unit::text, jsonb_build_object('productId', p.id));
  end if;
  return new;
end $$;
