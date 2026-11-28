-- Վճարման ժամկետը (payment_days) փոխել կարող է միայն «⚙️ Խանութների պայմաններ» իրավունքով
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
      new.payment_days := old.payment_days;
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
