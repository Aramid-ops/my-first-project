-- Խմբեր և գծեր (docs/SPEC.md §4.4)
--
-- · Խումբ — ֆիրմայի աշխատողների խումբ (մենեջեր, ներքին աշխատողներ, վարորդներ)։
--   Մեկ աշխատող կարող է լինել մի քանի խմբում։
-- · Գիծ — անուն + առաքման օրեր + մշտական վարորդ (կարելի է փոխել) + խումբ։
-- · Խանութը կցվում է գծին (shop_firm_links.line_id)։ Առաքման օրերը վերցվում են գծից։
-- · Փոխանցելիս ընտրությունը՝ իր խմբերի անդամներից; գծի վարորդը առաջարկվում է առաջինը։
-- · Խմբերը, գծերը, վարորդներին կարգավորում է ղեկավարը (admin)։
--   Խանութի գիծը կարող են փոխել ղեկավարը և խանութի մենեջերը; մենեջերին փոխում է միայն ղեկավարը։

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  name text not null
);

create table if not exists team_members (
  team_id uuid references teams(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  primary key (team_id, employee_id)
);

create table if not exists lines (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  name text not null,
  delivery_days smallint[] not null default '{}',  -- 1=երկուշաբթի … 7=կիրակի; դատարկ = ամեն օր
  driver_id uuid references employees(id) on delete set null
);

alter table shop_firm_links add column if not exists line_id uuid references lines(id) on delete set null;

alter table teams enable row level security;
alter table team_members enable row level security;
alter table lines enable row level security;

create function is_firm_admin(f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees where user_id = auth.uid() and active and role = 'admin' and firm_id = f)
$$;
grant execute on function is_firm_admin(uuid) to authenticated;

-- Կարդալ. ֆիրմայի աշխատողները; գիծը՝ նաև կապված խանութը (առաքման օրերի համար)
create policy teams_read on teams for select to authenticated using (firm_id = (my_employee()).firm_id);
create policy team_members_read on team_members for select to authenticated using (
  exists (select 1 from teams t where t.id = team_id and t.firm_id = (my_employee()).firm_id)
);
create policy lines_read on lines for select to authenticated using (
  firm_id = (my_employee()).firm_id
  or exists (select 1 from shop_firm_links l where l.line_id = lines.id and is_shop_member(l.shop_id))
);

-- Գրել. միայն ղեկավարը
create policy teams_admin on teams for all to authenticated using (is_firm_admin(firm_id)) with check (is_firm_admin(firm_id));
create policy team_members_admin on team_members for all to authenticated using (
  exists (select 1 from teams t where t.id = team_id and is_firm_admin(t.firm_id))
) with check (
  exists (select 1 from teams t where t.id = team_id and is_firm_admin(t.firm_id))
);
create policy lines_admin on lines for all to authenticated using (is_firm_admin(firm_id)) with check (is_firm_admin(firm_id));

-- Խանութի կապը. ղեկավարը կամ խանութի մենեջերը
drop policy if exists links_update on shop_firm_links;
create policy links_update on shop_firm_links for update to authenticated using (
  is_firm_admin(firm_id) or manager_id = (my_employee()).id
) with check (
  firm_id = (my_employee()).firm_id
);

create or replace function links_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.shop_id := old.shop_id;
  new.firm_id := old.firm_id;
  if not is_firm_admin(old.firm_id) then
    new.manager_id := old.manager_id;   -- մենեջերին փոխում է միայն ղեկավարը
    new.status := old.status;
  end if;
  if new.line_id is not null and not exists (select 1 from lines where id = new.line_id and firm_id = old.firm_id) then
    raise exception 'Գիծը չի պատկանում այս ֆիրմային';
  end if;
  return new;
end $$;
drop trigger if exists links_guard on shop_firm_links;
create trigger links_guard before update on shop_firm_links for each row execute function links_guard();
revoke execute on function links_guard() from public, anon, authenticated;

grant select, insert, update, delete on teams, team_members, lines to authenticated;
grant update on shop_firm_links to authenticated;

-- Ղեկավարը կարող է փոխել աշխատողների «լռելյայն փոխանցում» կարգավորումը
create policy employees_admin_update on employees for update to authenticated using (is_firm_admin(firm_id)) with check (is_firm_admin(firm_id));
grant update (default_forward_to, department, phone, active) on employees to authenticated;
