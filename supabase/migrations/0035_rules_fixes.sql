-- 0034-ի ուղղումներ (code review)

-- 1. Գործող ֆիրմաներում ներքին աշխատողները (հաշվապահ) շարունակում են հաստատել վճարումները, ինչպես առաջ
update employees set can_confirm_payments = true where role = 'staff' and active and not can_confirm_payments;

-- 2. Ֆիրման ինքը վճարում գրանցելիս (օր.՝ փոխանցում) այն «հաստատված» է միայն թույլտվությամբ;
--    միաժամանակյա երկու «Վճարել եմ» չեն կարող միասին գերազանցել պարտքը (կողպեք)
create or replace function payments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare open_debt numeric;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext(new.shop_id::text || new.firm_id::text));
    if is_shop_member(new.shop_id) then
      new.confirmed_at := null;
      new.confirmed_by := null;
      new.forwarded_to := null;
      new.marked_paid_by_shop_at := now();
      select coalesce((select debt - pending from debts() d where d.shop_id = new.shop_id and d.firm_id = new.firm_id), 0) into open_debt;
      if new.amount <= 0 or new.amount > open_debt then
        raise exception 'Գումարը չի կարող գերազանցել պարտքը (%)', open_debt;
      end if;
    elsif new.confirmed_at is not null and not can_confirm_payment(new.firm_id, new.shop_id) then
      new.confirmed_at := null;
      new.confirmed_by := null;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.shop_id := old.shop_id; new.firm_id := old.firm_id; new.amount := old.amount;
    if new.confirmed_at is not null and old.confirmed_at is null then
      new.confirmed_by := (select id from employees where user_id = auth.uid() and active limit 1);
      new.confirmed_at := now();
    end if;
  end if;
  return new;
end $$;

-- 3. Հիշեցում գիշերային վերջնաժամի դեպքում էլ (օր.՝ 00:30, 1 ժամ առաջ → 23:30-ից)
create or replace function send_cutoff_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  now_am timestamp := now() at time zone 'Asia/Yerevan';
  tomorrow int := extract(isodow from (now_am + interval '1 day'))::int;
begin
  for r in
    select l.shop_id, l.firm_id, ln.order_cutoff, f.name firm_name
    from shop_firm_links l join lines ln on ln.id = l.line_id join firms f on f.id = l.firm_id
    where l.status = 'active' and ln.order_cutoff is not null and ln.reminder_minutes is not null
      and (cardinality(ln.delivery_days) = 0 or tomorrow = any(ln.delivery_days))
      and exists (select 1 from (values (now_am::date + ln.order_cutoff), (now_am::date + 1 + ln.order_cutoff)) t(ts)
                  where now_am between t.ts - make_interval(mins => ln.reminder_minutes) and t.ts)
      and not exists (select 1 from orders o where o.shop_id = l.shop_id and o.firm_id = l.firm_id
                      and (o.created_at at time zone 'Asia/Yerevan')::date = now_am::date)
      and not exists (select 1 from cutoff_reminders_sent c where c.shop_id = l.shop_id and c.firm_id = l.firm_id and c.day = now_am::date)
  loop
    perform push_to_users(array(select user_id from shop_members where shop_id = r.shop_id), r.firm_name,
      '⏰ Վաղվա առաքման համար պատվիրեք մինչև ' || to_char(r.order_cutoff, 'HH24:MI'), jsonb_build_object('firmId', r.firm_id));
    insert into cutoff_reminders_sent values (r.shop_id, r.firm_id, now_am::date);
  end loop;
end $$;
revoke execute on function send_cutoff_reminders() from public, anon, authenticated;
