-- Որոնում և արտիկուլներ (docs/SPEC.md §16)
--
-- ՈՐՈՆՈՒՄ. մարդիկ գրում են հայերեն, ռուսերեն կամ լատինատառ («kat», «кат», «կաթ»)։
-- Բոլոր երեքը բերում ենք մեկ «կմախքի» (skeleton)՝ պարզեցված լատինատառ ձևի,
-- և համեմատում ենք կմախքները. սկզբից (prefix), մեջտեղից և մոտավոր (տառասխալներով)։
--
-- ԱՐՏԻԿՈՒԼ. 2 լատինատառ (ֆիրմայի նախածանց) + 4 թիվ, օր.՝ AT0012։
-- Մեծացնելու դեպքում թույլատրվում է 5 թիվ (AT10234)։

create extension if not exists pg_trgm;

-- ───────────── Տառադարձում → կմախք ─────────────
create or replace function search_skeleton(input text) returns text
language plpgsql immutable parallel safe as $$
declare
  s text := lower(coalesce(input, ''));
begin
  -- Հայերեն (նախ երկտառերը)
  s := replace(s, 'ու', 'u');
  s := replace(s, 'և', 'ev');
  s := translate(s, 'աբգդեզէըթիլկհմյնոպռսվտրփքօֆ', 'abgdezeetilkhmynoprsvtrpkof');
  s := replace(s, 'ժ', 'zh'); s := replace(s, 'խ', 'kh'); s := replace(s, 'ծ', 'ts');
  s := replace(s, 'ձ', 'dz'); s := replace(s, 'ղ', 'gh'); s := replace(s, 'ճ', 'ch');
  s := replace(s, 'շ', 'sh'); s := replace(s, 'չ', 'ch'); s := replace(s, 'ջ', 'j');
  s := replace(s, 'ց', 'ts');
  -- Ռուսերեն
  s := replace(s, 'ж', 'zh'); s := replace(s, 'х', 'kh'); s := replace(s, 'ц', 'ts');
  s := replace(s, 'ч', 'ch'); s := replace(s, 'ш', 'sh'); s := replace(s, 'щ', 'sh');
  s := replace(s, 'ю', 'yu'); s := replace(s, 'я', 'ya'); s := replace(s, 'ё', 'e');
  s := translate(s, 'абвгдезийклмнопрстуфыэъь', 'abvgdeziyklmnoprstufye');
  -- Լատինատառ տարբերակների միավորում (նույն հնչյունը տարբեր ձևով)
  s := replace(s, 'zh', 'j');
  s := replace(s, 'kh', 'x');
  s := replace(s, 'gh', 'x');
  s := replace(s, 'ch', 'c');
  s := replace(s, 'sh', 's');
  s := replace(s, 'ts', 'c');
  s := replace(s, 'dz', 'z');
  s := replace(s, 'ou', 'u');
  s := translate(s, 'qwyh', 'kvi');    -- q→k, w→v, y→i, h→(հանել)
  -- Միայն տառեր և թվեր, մեկ բացատով
  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');
  return trim(s);
end $$;

-- ───────────── Արտիկուլ ─────────────
alter table firms add column if not exists sku_prefix char(2) unique
  check (sku_prefix ~ '^[A-Z]{2}$');

alter table products add column if not exists sku text unique
  check (sku ~ '^[A-Z]{2}[0-9]{4,5}$');

alter table products add column if not exists search_key text
  generated always as (search_skeleton(coalesce(name, '') || ' ' || coalesce(pack_note, '') || ' ' || coalesce(code, ''))) stored;

create index if not exists products_search_trgm on products using gin (search_key gin_trgm_ops);

alter table firms add column if not exists search_key text
  generated always as (search_skeleton(coalesce(name, '') || ' ' || coalesce(category, ''))) stored;

-- Նոր ապրանքը ավտոմատ ստանում է հաջորդ արտիկուլը (նախածանց + հաջորդ համար)
create or replace function products_assign_sku() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pref text;
  n int;
begin
  if new.sku is not null then
    new.sku := upper(new.sku);
    return new;
  end if;
  select sku_prefix into pref from firms where id = new.firm_id;
  if pref is null then
    return new;  -- ֆիրման դեռ նախածանց չունի
  end if;
  perform pg_advisory_xact_lock(hashtext('sku:' || pref));
  select coalesce(max(substring(sku from 3)::int), 0) + 1 into n
    from products where sku like pref || '%';
  new.sku := pref || lpad(n::text, 4, '0');
  return new;
end $$;

drop trigger if exists products_assign_sku on products;
create trigger products_assign_sku before insert on products
  for each row execute function products_assign_sku();
revoke execute on function products_assign_sku() from public, anon, authenticated;

-- ───────────── Որոնման ֆունկցիա ─────────────
-- security invoker. RLS-ը գործում է → ամեն մեկը գտնում է միայն իրեն հասանելի ապրանքները
create or replace function search_products(q text, max_rows int default 30)
returns table (
  product_id uuid,
  firm_id uuid,
  sku text,
  name text,
  unit text,
  price numeric,
  in_stock boolean,
  firm_name text,
  score real
)
language sql stable security invoker set search_path = public as $$
  with k as (
    select search_skeleton(q) as key, upper(regexp_replace(q, '\s', '', 'g')) as code
  )
  select p.id, p.firm_id, p.sku, p.name, p.unit, p.price, p.in_stock, f.name,
    (case
       when p.sku = k.code then 100                       -- ճիշտ արտիկուլ
       when p.sku like k.code || '%' and length(k.code) >= 2 then 50
       when p.search_key like k.key || '%' then 30        -- սկսվում է
       when p.search_key like '% ' || k.key || '%' then 25 -- բառը սկսվում է
       when p.search_key like '%' || k.key || '%' then 15
       else 0
     end + 10 * word_similarity(k.key, p.search_key))::real as score
  from products p
  join firms f on f.id = p.firm_id
  cross join k
  where length(k.key) >= 1
    and (
      p.sku = k.code
      or (length(k.code) >= 2 and p.sku like k.code || '%')
      or p.search_key like '%' || k.key || '%'
      or (length(k.key) >= 3 and k.key <% p.search_key)   -- մոտավոր (տառասխալ)
    )
  order by score desc, p.in_stock desc, p.name
  limit max_rows
$$;

grant execute on function search_products(text, int) to authenticated;
grant execute on function search_skeleton(text) to authenticated;

-- Փորձնական ֆիրմաների նախածանցներ և արտիկուլներ
update firms set sku_prefix = 'AT' where id = '10000000-0000-0000-0000-000000000001' and sku_prefix is null;
update firms set sku_prefix = 'KT' where id = '10000000-0000-0000-0000-000000000002' and sku_prefix is null;
update firms set sku_prefix = 'HC' where id = '10000000-0000-0000-0000-000000000003' and sku_prefix is null;

update products p set sku = f.sku_prefix || lpad(x.rn::text, 4, '0')
from (select id, row_number() over (partition by firm_id order by name) rn from products) x, firms f
where p.id = x.id and f.id = p.firm_id and p.sku is null and f.sku_prefix is not null;
