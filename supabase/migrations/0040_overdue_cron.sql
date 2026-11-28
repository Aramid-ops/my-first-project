-- Ժամկետանց պարտքի հիշեցում ամեն օր 10:00-ին (Երևան = UTC+4 → 06:00 UTC)
select cron.schedule('overdue-reminders', '0 6 * * *', 'select public.send_overdue_reminders()');
