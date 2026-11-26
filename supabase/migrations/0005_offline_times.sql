-- Վարորդը կարող է աշխատել առանց ինտերնետի. գործողությունը ուղարկվում է ավելի ուշ,
-- բայց պատմության մեջ պետք է երևա ԻՐԱԿԱՆ ժամը (երբ սեղմվեց)։
-- Ընդունում ենք հավելվածի ժամը, եթե այն ապագայում չէ և 7 օրից հին չէ։
create or replace function order_events_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n text;
begin
  new.actor_user := auth.uid();
  select name into n from employees where user_id = auth.uid() and active limit 1;
  if n is null then
    select s.name into n from shop_members m join shops s on s.id = m.shop_id
      where m.user_id = auth.uid() limit 1;
  end if;
  new.actor_name := coalesce(n, new.actor_name, '');
  if new.at is null or new.at > now() or new.at < now() - interval '7 days' then
    new.at := now();
  end if;
  return new;
end $$;
