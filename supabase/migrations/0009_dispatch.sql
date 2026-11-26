-- Վարորդների բաշխում (docs/SPEC.md §5.1)
--
-- · Վարորդը առավոտյան սեղմում է «Գործի եմ» → driver_checkins
-- · Փոխանցողը տեսնում է բոլոր վարորդներին՝ ով է գործի, քանի բաց պատվեր ունի, որ խանութներն են
--   (մենեջերը ինքը չի տեսնում ուրիշ մենեջերների պատվերները, ուստի տալիս ենք միայն ամփոփում՝ driver_load)
-- · Ֆիրմայի բազայի (պահեստի) կոորդինատները՝ կանգառները մոտիկից հեռու շարելու համար

alter table firms add column if not exists base_lat double precision;
alter table firms add column if not exists base_lng double precision;

create table if not exists driver_checkins (
  driver_id uuid not null references employees(id) on delete cascade,
  day date not null,
  firm_id uuid not null references firms(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  primary key (driver_id, day)
);
alter table driver_checkins enable row level security;

create policy checkins_read on driver_checkins for select to authenticated using (firm_id = (my_employee()).firm_id);
create policy checkins_write on driver_checkins for insert to authenticated with check (
  driver_id = (my_employee()).id and firm_id = (my_employee()).firm_id and (my_employee()).role = 'driver'
);
grant select, insert on driver_checkins to authenticated;

-- Ամփոփում վարորդների մասին. միայն նույն ֆիրմայի աշխատողների համար
create or replace function driver_load(p_day date default current_date)
returns table (
  driver_id uuid,
  name text,
  checked_in boolean,
  open_orders int,
  shop_names text[]
)
language sql stable security definer set search_path = public as $$
  select e.id, e.name,
    exists (select 1 from driver_checkins c where c.driver_id = e.id and c.day = p_day),
    (select count(*)::int from orders o where o.driver_id = e.id and o.status in ('preparing', 'on_the_way')),
    coalesce((select array_agg(distinct s.name) from orders o join shops s on s.id = o.shop_id
              where o.driver_id = e.id and o.status in ('preparing', 'on_the_way')), '{}')
  from employees e
  where e.role = 'driver' and e.active
    and e.firm_id = (select firm_id from employees where user_id = auth.uid() and active limit 1)
  order by 3 desc, e.name
$$;
grant execute on function driver_load(date) to authenticated;
