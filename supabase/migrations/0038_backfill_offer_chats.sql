-- Առաջարկները, որոնք գրվել են «առաջարկ → չաթ» ֆունկցիայից առաջ, նույնպես գնում են անձնական չաթ (մեկանգամյա)
select chat_post(e.user_id, (select user_id from shop_members where shop_id = r.shop_id limit 1),
                 e.name || ' · ' || f.name, s.name,
                 '💼 Առաջարկ ձեր «' || r.text || '» հարցմանը. ' || o.text || coalesce(' · ' || trim_scale(o.price)::text || ' ֏', ''))
from supply_offers o
join supply_requests r on r.id = o.request_id
join shops s on s.id = r.shop_id
join firms f on f.id = o.firm_id
join employees e on e.id = o.employee_id
where not exists (select 1 from messages m where m.body like '💼 Առաջարկ ձեր «' || r.text || '» հարցմանը. ' || o.text || '%');
