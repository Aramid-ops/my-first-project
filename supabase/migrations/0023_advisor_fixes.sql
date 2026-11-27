-- Supabase advisor-ի նախազգուշացումների ուղղում (2026-11-27)

-- 1. Ֆունկցիաներ. ոչ ոք՝ առանց մուտքի (anon), բացի գրանցման էջի ֆիրմաների ցուցակից
do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public, anon;
grant execute on function public_firms() to anon, authenticated;

-- Մուտք գործածների համար՝ միայն այն, ինչ կանչում է հավելվածը կամ անվտանգության կանոնները
grant execute on function
  my_employee(), is_shop_member(uuid), is_firm_admin(uuid), can_manage_firm(uuid), check_order_limits(uuid),
  place_order(uuid, uuid, date, jsonb), place_order_for_shop(uuid, uuid, date, jsonb), search_products(text, int), search_skeleton(text),
  debts(), my_prices(uuid), request_join(uuid), driver_load(date), firm_driver_verification(),
  invite_employee(text, employee_role, text, text), accept_invite(text), invite_user(uuid, employee_role, text), answer_job_invite(uuid, boolean),
  available_drivers(), my_contacts(), open_chat(uuid), submit_driver_verification(text, text, text, text),
  decide_driver_verification(uuid, boolean, text), decide_firm_claim(uuid, boolean), pending_verifications(), pending_claims()
to authenticated;
-- (price_for, can_chat, my_display_name, push_to_users, trigger-ները՝ միայն ներսից)

-- 2. Ֆիքսված search_path
alter function orders_guard() set search_path = public;
alter function search_skeleton(text) set search_path = public;

-- 3. auth.uid()՝ մեկ անգամ հարցման համար, ոչ թե ամեն տողի
alter policy shop_members_read on shop_members using (user_id = (select auth.uid()));
alter policy order_events_create on order_events with check (actor_user = (select auth.uid()) and exists (select 1 from orders o where o.id = order_id));
alter policy push_tokens_own on push_tokens using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy firm_claims_own on firm_claims using (user_id = (select auth.uid()));
alter policy driver_profiles_own on driver_profiles using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy job_invites_read on job_invites using (user_id = (select auth.uid()) or firm_id = (select (my_employee()).firm_id));
alter policy conversations_read on conversations using ((select auth.uid()) in (a, b));
alter policy messages_read on messages using (exists (select 1 from conversations c where c.id = conversation_id and (select auth.uid()) in (c.a, c.b)));
alter policy messages_send on messages with check (sender = (select auth.uid()) and exists (select 1 from conversations c where c.id = conversation_id and (select auth.uid()) in (c.a, c.b)));
alter policy messages_mark_read on messages using (sender <> (select auth.uid()) and exists (select 1 from conversations c where c.id = conversation_id and (select auth.uid()) in (c.a, c.b)));
alter policy platform_admins_self on platform_admins using (user_id = (select auth.uid()));

-- 4. Ինդեքսներ կապերի (foreign key) վրա
create index if not exists orders_manager_idx on orders (manager_id);
create index if not exists orders_assignee_idx on orders (assignee_id);
create index if not exists orders_driver_idx on orders (driver_id);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_product_idx on order_items (product_id);
create index if not exists order_events_order_idx on order_events (order_id);
create index if not exists order_issues_order_idx on order_issues (order_id);
create index if not exists shop_firm_links_firm_idx on shop_firm_links (firm_id);
create index if not exists shop_firm_links_manager_idx on shop_firm_links (manager_id);
create index if not exists shop_firm_links_line_idx on shop_firm_links (line_id);
create index if not exists shop_members_user_idx on shop_members (user_id);
create index if not exists payments_shop_firm_idx on payments (shop_id, firm_id);
create index if not exists payments_firm_idx on payments (firm_id);
create index if not exists team_members_employee_idx on team_members (employee_id);
create index if not exists teams_firm_idx on teams (firm_id);
create index if not exists lines_firm_idx on lines (firm_id);
create index if not exists push_tokens_user_idx on push_tokens (user_id);
create index if not exists job_invites_user_idx on job_invites (user_id);
create index if not exists job_invites_firm_idx on job_invites (firm_id);
create index if not exists conversations_b_idx on conversations (b);
create index if not exists messages_sender_idx on messages (sender);
create index if not exists saved_lists_shop_idx on saved_lists (shop_id);
create index if not exists external_suppliers_shop_idx on external_suppliers (shop_id);
create index if not exists shop_prices_product_idx on shop_prices (product_id);
create index if not exists driver_days_firm_idx on driver_days (firm_id);
create index if not exists driver_checkins_firm_idx on driver_checkins (firm_id);
create index if not exists firm_claims_firm_idx on firm_claims (firm_id);
