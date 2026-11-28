-- Կատեգորիաները կառավարում է հարթակը (🛡). մեկ ցանկ բոլորի համար, ֆիրմաները միայն ընտրում են
create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = (select auth.uid()))
$$;
grant execute on function is_platform_admin() to authenticated;

create table if not exists categories (
  name text primary key check (length(trim(name)) between 2 and 60),
  created_at timestamptz not null default now()
);
insert into categories (name)
  select distinct category from category_keywords
  union select 'Այլ'
  union select distinct category from products where category is not null and not category_auto
on conflict do nothing;
alter table categories enable row level security;
create policy categories_read on categories for select to authenticated using (true);
create policy categories_admin on categories for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
grant select, insert, update, delete on categories to authenticated;

create policy category_keywords_admin on category_keywords for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
grant insert, update, delete on category_keywords to authenticated;

-- Գրվածը → ցանկի կատեգորիա (նույնը կամ 1–2 տառ տարբերությամբ); չկա՝ null (ֆիրման պետք է ընտրի)
create or replace function normalize_category(p text) returns text
language sql stable security definer set search_path = public, extensions as $$
  with t as (select nullif(trim(regexp_replace(p, '\s+', ' ', 'g')), '') v)
  select c.name from categories c, t
  where t.v is not null and (category_key(c.name) = category_key(t.v)
     or (length(category_key(t.v)) >= 5
         and (levenshtein(category_key(c.name), category_key(t.v)) <= 2
              or levenshtein(split_part(category_key(c.name), ' ', 1), category_key(t.v)) <= 1)))
  order by (category_key(c.name) = category_key(t.v)) desc, levenshtein(category_key(c.name), category_key(t.v))
  limit 1
$$;

-- Ընտրված կատեգորիան պետք է լինի ցանկից. չճանաչված՝ ավտոմատ (ֆիրման կընտրի)
create or replace function products_category() returns trigger
language plpgsql set search_path = public as $$
begin
  if not new.category_auto and new.category is not null then
    new.category := normalize_category(new.category);
    if new.category is null then new.category_auto := true; end if;
  end if;
  if new.category_auto or new.category is null then new.category := guess_category(new.name); end if;
  return new;
end $$;

-- Ադմին. անվանափոխել / միավորել (եթե նոր անունն արդեն կա) / ջնջել (→ «Այլ»)
create or replace function rename_category(p_old text, p_new text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := trim(regexp_replace(p_new, '\s+', ' ', 'g'));
begin
  if not is_platform_admin() then raise exception 'Միայն հարթակի ադմինը'; end if;
  if p_old = 'Այլ' then raise exception '«Այլ»-ը չի կարելի փոխել'; end if;
  if length(n) < 2 then raise exception 'Անունը շատ կարճ է'; end if;
  insert into categories (name) values (n) on conflict do nothing;
  update products set category = n where category = p_old;
  update category_keywords k set category = n where category = p_old
    and not exists (select 1 from category_keywords x where x.category = n and x.keyword = k.keyword);
  delete from category_keywords where category = p_old;
  update firms set categories = array(select distinct unnest(array_replace(categories, p_old, n))) where p_old = any(categories);
  update supply_requests set category = n where category = p_old;
  if n <> p_old then delete from categories where name = p_old; end if;
end $$;

create or replace function delete_category(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Միայն հարթակի ադմինը'; end if;
  if p_name = 'Այլ' then raise exception '«Այլ»-ը չի կարելի ջնջել'; end if;
  update products set category = 'Այլ' where category = p_name;
  delete from category_keywords where category = p_name;
  update firms set categories = array_remove(categories, p_name) where p_name = any(categories);
  update supply_requests set category = null where category = p_name;
  delete from categories where name = p_name;
end $$;

-- Ադմինը տեղավորում է ցանկացած ֆիրմայի ապրանք (օր.՝ «Այլ»-ից)
create or replace function admin_set_product_category(p_product uuid, p_category text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Միայն հարթակի ադմինը'; end if;
  if not exists (select 1 from categories where name = p_category) then raise exception 'Կատեգորիան չկա'; end if;
  update products set category = p_category, category_auto = false where id = p_product;
end $$;

-- Կատեգորիաներ՝ ապրանքների քանակով (ադմինի էջի համար)
create or replace function category_stats() returns table (name text, products int, keywords text[])
language sql stable security definer set search_path = public as $$
  select c.name, (select count(*) from products p where p.category = c.name)::int,
    coalesce((select array_agg(keyword order by keyword) from category_keywords k where k.category = c.name), '{}')
  from categories c where is_platform_admin() order by c.name = 'Այլ', c.name
$$;

-- «Այլ»-ում ընկած ապրանքները (բոլոր ֆիրմաներից)
create or replace function uncategorized_products() returns table (id uuid, name text, firm_name text, category_auto boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, f.name, p.category_auto from products p join firms f on f.id = p.firm_id
  where p.category = 'Այլ' and is_platform_admin() order by f.name, p.name limit 300
$$;

revoke execute on function rename_category(text, text), delete_category(text), admin_set_product_category(uuid, text), category_stats(), uncategorized_products() from public, anon;
grant execute on function rename_category(text, text), delete_category(text), admin_set_product_category(uuid, text), category_stats(), uncategorized_products() to authenticated;
