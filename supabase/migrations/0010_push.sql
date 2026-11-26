-- Ծանուցումներ (push) Android / iPhone-ում (docs/SPEC.md §17)
--
-- Հավելվածը պահում է իր push token-ը → push_tokens։
-- Պատվերի փոփոխությունից հետո բազան ինքն է ուղարկում ծանուցումը Expo Push ծառայությանը (pg_net)։
--   · նոր պատվեր            → խանութի մենեջերին
--   · պատվերը փոխանցվեց     → նոր պատասխանատուին (աշխատող / վարորդ)
--   · ընդունվեց / ճանապարհին / առաքված → խանութին

create extension if not exists pg_net;

create table if not exists push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);
alter table push_tokens enable row level security;
create policy push_tokens_own on push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on push_tokens to authenticated;

create or replace function push_to_users(uids uuid[], title text, body text, payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object('to', token, 'title', title, 'body', body, 'data', payload, 'sound', 'default'))
    into msgs from push_tokens where user_id = any(uids);
  if msgs is null then return; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := msgs,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end $$;
revoke execute on function push_to_users(uuid[], text, text, jsonb) from public, anon, authenticated;

create or replace function orders_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  shop_name text := (select name from shops where id = new.shop_id);
  firm_name text := (select name from firms where id = new.firm_id);
  shop_users uuid[] := array(select user_id from shop_members where shop_id = new.shop_id);
  payload jsonb := jsonb_build_object('orderId', new.id);
begin
  if tg_op = 'INSERT' then
    perform push_to_users(array(select user_id from employees where id = new.manager_id and user_id is not null),
      '🛒 Նոր պատվեր', shop_name, payload);
    return new;
  end if;

  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
    perform push_to_users(array(select user_id from employees where id = new.assignee_id and user_id is not null),
      '📦 Ձեզ փոխանցվեց պատվեր', shop_name, payload);
  end if;

  if new.status is distinct from old.status then
    if new.status = 'accepted' then
      perform push_to_users(shop_users, firm_name, 'Մենեջերը ընդունեց պատվերը', payload);
    elsif new.status = 'on_the_way' then
      perform push_to_users(shop_users, firm_name, '🚚 Վարորդը ճանապարհին է', payload);
    elsif new.status = 'delivered' then
      perform push_to_users(shop_users, firm_name, '✅ Պատվերը առաքված է', payload);
    end if;
  end if;
  return new;
end $$;
revoke execute on function orders_notify() from public, anon, authenticated;

drop trigger if exists orders_notify on orders;
create trigger orders_notify after insert or update on orders
  for each row execute function orders_notify();
