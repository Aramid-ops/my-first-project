-- Վերջնաժամի հիշեցումը՝ ամեն 15 րոպեն մեկ
create extension if not exists pg_cron;
select cron.schedule('cutoff-reminders', '*/15 * * * *', 'select public.send_cutoff_reminders()');
