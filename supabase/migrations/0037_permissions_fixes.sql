-- 0036-ի ուղղումներ (code review)

-- 1. Խանութը իր կողմից կարող է ստեղծել միայն իր հայտը (ոչ «ֆիրմայի առաջարկ», ոչ սև ցուցակ)
drop policy if exists links_request on shop_firm_links;
create policy links_request on shop_firm_links for insert to authenticated with check (
  is_shop_member(shop_id) and status = 'pending' and initiated_by = 'shop' and not blocked
);

-- 2. Սև ցուցակի պատճառը տեսնում է միայն ֆիրման (առանձին աղյուսակ, խանութը չի կարդում)
create table if not exists link_block_notes (
  shop_id uuid not null references shops (id) on delete cascade,
  firm_id uuid not null references firms (id) on delete cascade,
  reason text not null check (length(reason) <= 300),
  primary key (shop_id, firm_id)
);
create index if not exists link_block_notes_firm_idx on link_block_notes (firm_id);
alter table link_block_notes enable row level security;
create policy link_block_notes_read on link_block_notes for select to authenticated using (firm_id = (select (my_employee()).firm_id));
create policy link_block_notes_write on link_block_notes for all to authenticated
  using (firm_id = (select (my_employee()).firm_id) and has_perm('blacklist', firm_id))
  with check (firm_id = (select (my_employee()).firm_id) and has_perm('blacklist', firm_id));
grant select, insert, update, delete on link_block_notes to authenticated;
insert into link_block_notes (shop_id, firm_id, reason)
  select shop_id, firm_id, blocked_reason from shop_firm_links where blocked_reason is not null on conflict do nothing;
alter table shop_firm_links drop column if exists blocked_reason;

-- 3. Թույլտվությունը՝ ըստ աշխատողի (ծանուցումների համար էլ), ոչ միայն ներկա օգտատիրոջ
create or replace function emp_has_perm(emp uuid, p text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare e employees := (select x from employees x where x.id = emp and x.active);
begin
  if e.id is null then return false; end if;
  if e.role = 'admin' and p <> 'payments_confirm' then return true; end if;
  -- ղեկավար չունեցող ֆիրմայում. ամեն ինչ, բացի վճարումների հաստատումից
  -- (այն՝ ներքին աշխատողը (հաշվապահ), իսկ մենեջերը՝ միայն իր խանութների համար, տե՛ս can_confirm_payment)
  if e.role in ('manager', 'staff') and not firm_has_admin(e.firm_id) then
    return p <> 'payments_confirm' or e.role = 'staff';
  end if;
  return coalesce(
    (select allowed from firm_perms where firm_id = e.firm_id and target = 'emp:' || e.id and perm = p),
    (select allowed from firm_perms where firm_id = e.firm_id and e.department is not null and target = 'dept:' || e.department and perm = p),
    (select allowed from firm_perms where firm_id = e.firm_id and target = 'role:' || e.role and perm = p),
    default_perm(e.role, p));
end $$;
revoke execute on function emp_has_perm(uuid, text) from public, anon, authenticated;

create or replace function has_perm(p text, f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(emp_has_perm((select e.id from employees e where e.user_id = (select auth.uid()) and e.active and e.firm_id = f limit 1), p), false)
$$;

create or replace function payments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_to_users(
    array(select e.user_id from employees e where e.firm_id = new.firm_id and e.active and e.user_id is not null
            and (emp_has_perm(e.id, 'payments_confirm') or e.id = (select manager_id from shop_firm_links where shop_id = new.shop_id and firm_id = new.firm_id))),
    '💳 ' || (select name from shops where id = new.shop_id) || '-ը վճարել է',
    trim_scale(new.amount)::text || ' ֏ · ' || case new.method when 'cash_driver' then 'կանխիկ վարորդին' when 'cash_manager' then 'կանխիկ մենեջերին' else 'փոխանցում' end,
    jsonb_build_object('paymentId', new.id));
  return new;
end $$;

-- 4. Ֆիրման ինքը չի կարող ընդունել իր իսկ առաջարկը (միայն խանութը՝ answer_partnership-ով)
create or replace function links_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare me employees := my_employee();
begin
  new.shop_id := old.shop_id;
  new.firm_id := old.firm_id;
  new.initiated_by := old.initiated_by;
  if current_setting('app.partnership', true) = 'on' or (select auth.uid()) is null then return new; end if;
  if me.id is null then return old; end if;
  if old.initiated_by = 'firm' and old.status = 'pending' and new.status <> old.status then
    new.status := old.status;   -- խանութը դեռ չի համաձայնել
  end if;
  if not is_firm_admin(old.firm_id) then
    if not (old.status = 'pending' and new.status = 'active' and has_perm('shops_new', old.firm_id)
            and (new.manager_id = me.id or me.role <> 'manager')) then
      new.status := old.status;
      new.manager_id := old.manager_id;
    end if;
    if not has_perm('shop_terms', old.firm_id) then
      new.discount_pct := old.discount_pct;
      new.credit_limit := old.credit_limit;
    end if;
    if not has_perm('blacklist', old.firm_id) then
      new.blocked := old.blocked;
    end if;
    if not has_perm('lines', old.firm_id) and not has_perm('shop_terms', old.firm_id) then
      new.line_id := old.line_id;
    end if;
  end if;
  if new.line_id is not null and not exists (select 1 from lines where id = new.line_id and firm_id = old.firm_id) then
    raise exception 'Գիծը չի պատկանում այս ֆիրմային';
  end if;
  return new;
end $$;

-- 5. «Հայտը ընդունված է» ծանուցումը՝ միայն խանութի հայտերի համար (ոչ ֆիրմայի առաջարկի)
create or replace function links_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'active' and new.initiated_by = 'shop' then
    perform push_to_users(array(select user_id from shop_members where shop_id = new.shop_id),
      (select name from firms where id = new.firm_id), '✅ Հայտը ընդունված է. կարող եք պատվիրել', jsonb_build_object('firmId', new.firm_id));
  end if;
  return new;
end $$;

-- 6. Սև ցուցակի խանութը չի կարող ուղարկել նաև գրված / թելադրված պատվեր
create or replace function send_text_order(p_firm uuid, p_text text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := (select shop_id from shop_members where user_id = auth.uid() limit 1);
  l shop_firm_links;
  tid uuid;
begin
  select * into l from shop_firm_links where shop_id = sid and firm_id = p_firm and status = 'active';
  if l.shop_id is null then raise exception 'Դուք միացած չեք այս մատակարարին'; end if;
  if l.blocked then raise exception 'Այս մատակարարից պատվերը ժամանակավորապես անհասանելի է. կապվեք մենեջերի հետ'; end if;
  if length(trim(coalesce(p_text, ''))) = 0 then raise exception 'Պատվերը դատարկ է'; end if;
  insert into text_orders (shop_id, firm_id, manager_id, text)
    values (sid, p_firm, l.manager_id, trim(p_text)) returning id into tid;
  perform push_to_users(
    array(select user_id from employees where id = l.manager_id and user_id is not null),
    '📝 ' || (select name from shops where id = sid),
    left(trim(p_text), 120), jsonb_build_object('textOrderId', tid));
  return tid;
end $$;
