-- Վարորդի պատմություն և օրվա ամփոփում (docs/SPEC.md §7.4.2)
--
-- · «Մեկնեցի» / «Առաքված» սեղմելիս պահվում է տեղը (եթե վարորդը թույլ է տվել)
--   → դրանից հաշվվում է մոտավոր կիլոմետրաժը։ Անընդհատ GPS հետևում ՉԿԱ։
-- · «Ավարտել օրը» → մեկ տող driver_days-ում։

alter table order_events add column if not exists lat double precision;
alter table order_events add column if not exists lng double precision;

create table if not exists driver_days (
  driver_id uuid not null references employees(id) on delete cascade,
  day date not null,
  firm_id uuid not null references firms(id) on delete cascade,
  started_at timestamptz,       -- առաջին «Մեկնեցի»
  finished_at timestamptz not null,
  stops_delivered int not null default 0,
  km_estimate numeric(7,1),     -- մոտավոր (կետերի միջև հեռավորություն × ճանապարհի գործակից)
  primary key (driver_id, day)
);

alter table driver_days enable row level security;

-- Վարորդը տեսնում և գրում է միայն իրենը; ֆիրմայի ադմինն ու ներքին աշխատողները՝ ֆիրմայինը
create policy driver_days_read on driver_days for select to authenticated using (
  driver_id = (my_employee()).id
  or (firm_id = (my_employee()).firm_id and (my_employee()).role in ('admin', 'staff', 'manager'))
);
create policy driver_days_write on driver_days for insert to authenticated with check (
  driver_id = (my_employee()).id and firm_id = (my_employee()).firm_id
);
create policy driver_days_update on driver_days for update to authenticated using (
  driver_id = (my_employee()).id
) with check (
  driver_id = (my_employee()).id and firm_id = (my_employee()).firm_id
);

grant select, insert, update on driver_days to authenticated;
