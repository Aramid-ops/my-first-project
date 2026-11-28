-- 1. Կատեգորիաների միավորում. «Պահածո», «պահածոներ », «ՊԱՀԱԾՈՆԵՐ» → մեկ կատեգորիա (եղածը)
create or replace function category_key(t text) returns text
language sql immutable set search_path = public as $$
  select search_skeleton(regexp_replace(lower(trim(regexp_replace(t, '\s+', ' ', 'g'))), '(ներ|եր)$', ''))
$$;

create or replace function normalize_category(p text) returns text
language sql stable security definer set search_path = public as $$
  with t as (select nullif(trim(regexp_replace(p, '\s+', ' ', 'g')), '') v)
  select case when t.v is null then null else coalesce(
    -- նախ ստանդարտ կատեգորիաները, հետո ամենաշատ օգտագործվածը
    (select c from (
       select category c, 0 pri, 0 n from category_keywords group by category
       union all
       select category, 1, count(*) from products where category is not null group by category
     ) x where category_key(x.c) = category_key(t.v) order by pri, n desc limit 1),
    upper(left(t.v, 1)) || substr(t.v, 2)) end
  from t
$$;
revoke execute on function normalize_category(text) from public, anon;
grant execute on function normalize_category(text) to authenticated;

create or replace function products_category() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.category_auto or new.category is null then new.category := guess_category(new.name);
  else new.category := normalize_category(new.category);
  end if;
  return new;
end $$;

-- եղած կրկնօրինակները միավորում ենք
update products p set category = normalize_category(p.category) where not p.category_auto and p.category is not null;

-- 2. Ապրանքը «Կա» է դառնում միայն պահեստում քանակ լինելու դեպքում (հավելվածից)։
--    Նոր ապրանքը սկսում է «Չկա»-ով։ Անջատել («Չկա») միշտ կարելի է։
create or replace function products_stock_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select auth.uid()) is null then return new; end if;   -- սերվերային սկրիպտներ / seed
  if new.in_stock and (tg_op = 'INSERT' or not old.in_stock)
     and coalesce((select sum(qty) from stock_moves where product_id = new.id), 0) <= 0 then
    if tg_op = 'INSERT' then new.in_stock := false;
    else raise exception 'Ավելացրեք քանակը պահեստում, որ ապրանքը երևա';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists products_stock_guard on products;
create trigger products_stock_guard before insert or update of in_stock on products
  for each row execute function products_stock_guard();
