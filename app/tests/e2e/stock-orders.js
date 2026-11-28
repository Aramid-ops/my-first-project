// Բրաուզերային թեստ՝ SPEC §31 (Excel ներմուծում, 📦 պահեստ, պատվերի ուղղում, փոխարինող, ակցիա հաճախորդներին, վճարման ժամկետ)
// Գործարկում. node tests/e2e/stock-orders.js <պանակ> <sq.sh> <test-import.xlsx>. Հաշիվներ՝ t-boss@, t-man@, t-shop@demo.matakarar.com
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const [S, SQ, XLSX] = process.argv.slice(2);
const BASE = 'http://localhost:8100/my-first-project';
const sql = (q) => { fs.writeFileSync(S + '/q.sql', q); const out = execSync(`bash ${SQ} -f ${S}/q.sql`).toString(); if (!out.includes('HTTP 201')) throw new Error('SQL: ' + out); return out; };
const ok = (name, cond) => { console.log(`${cond ? '✅' : '❌'} ${name}`); if (!cond) process.exitCode = 1; };
async function login(b, email) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + '/'); await p.waitForTimeout(2500);
  await p.getByLabel('Էլ. փոստ').fill(email);
  await p.getByRole('textbox', { name: 'Գաղտնաբառ' }).fill('Test-12345x');
  await p.getByText('Մուտք', { exact: true }).click();
  await p.waitForURL((u) => !/my-first-project\/?$/.test(u.pathname), { timeout: 25000 }).catch(() => {}); await p.waitForTimeout(2500);
  return p;
}
const vis = (p, t, o = {}) => p.getByText(t, o).filter({ visible: true }).first();
const F = `(select id from firms where name = 'Թեստ Ֆիրմա')`;
const P = (n) => `(select id from products where name = '${n}' and firm_id = ${F})`;
(async () => {
  // նախնական վիճակ (թեստը կարելի է կրկնել)
  sql(`delete from orders where firm_id = ${F} and status <> 'delivered';
       delete from stock_moves where firm_id = ${F};
       delete from products where firm_id = ${F} and name in ('Թեստ պանիր', 'Թեստ ավտո յուղ');
       update products set price = 500, in_stock = true where firm_id = ${F} and name = 'Թեստ կաթ 1 լ';
       update shop_firm_links set payment_days = null where firm_id = ${F};
       delete from supplier_deals where text = 'Թեստ ակցիա հաճախորդներին';`);
  const b = await chromium.launch();
  // 18. Excel ներմուծում՝ նախադիտումով
  const a = await login(b, 't-boss@demo.matakarar.com');
  await a.goto(BASE + '/firm/products'); await a.waitForTimeout(2500);
  ok('18. «📥 Ներբեռնել նմուշը» կա', (await a.getByText(/Ներբեռնել նմուշը/).count()) === 1);
  const [fc] = await Promise.all([a.waitForEvent('filechooser'), vis(a, '📊 Ներմուծել Excel-ից').click()]);
  await fc.setFiles(XLSX); await a.waitForTimeout(2500);
  ok('18. նախադիտում՝ 2 նոր', (await a.getByText('🆕 Նոր ապրանք՝ 2').count()) === 1);
  ok('18. ցանկում չեղած կատեգորիան նշված է', (await a.getByText(/Ցանկում չկա՝ ավտոյի պահեստամասեր/).count()) === 1);
  ok('18. «1 ապրանքի գինը կփոխվի»', (await a.getByText(/1 ապրանքի գինը կփոխվի/).count()) === 1);
  ok('18. սխալ միավորը ցույց է տրված', (await a.getByText(/«շիշ» միավոր չկա/).count()) === 1);
  await a.screenshot({ path: S + '/s18-preview.png' });
  await vis(a, /Հաստատել \(3\)/).click(); await a.waitForTimeout(4000);
  ok('18. գինը թարմացավ բազայում', sql(`select price from products where id = ${P('Թեստ կաթ 1 լ')}`).includes('777'));
  ok('18. ֆիրման նոր կատեգորիա չի ստեղծում (առաջարկ՝ Ավտոապրանքներ, չընտրված)', sql(`select category, category_auto from products where id = ${P('Թեստ ավտո յուղ')}`).includes('"category":"Ավտոապրանքներ","category_auto":true'));
  ok('18. նոր ապրանքը՝ «Չկա» (առանց պահեստի)', sql(`select in_stock from products where id = ${P('Թեստ պանիր')}`).includes('false'));
  ok('17. կատեգորիաներով խմբավորված', (await a.getByText(/^Ավտոապրանքներ · 1/).count()) === 1);
  await a.getByLabel('Թեստ պանիր՝ Չկա').click(); await a.waitForTimeout(2000);
  ok('19. նախ հարցնում է կատեգորիան', (await a.getByText(/Ընտրեք «Թեստ պանիր»-ի կատեգորիան/).count()) === 1);
  await vis(a, 'Կաթնամթերք', { exact: true }).click();
  await vis(a, 'Պահել', { exact: true }).click(); await a.waitForTimeout(3000);
  ok('19. կատեգորիան ընտրված է', sql(`select category_auto from products where id = ${P('Թեստ պանիր')}`).includes('false'));
  ok('19. հետո հարցնում է պահեստի քանակը', (await a.getByText(/Որ ապրանքը երևա խանութներին/).count()) === 1);
  await a.getByLabel('Քանակ պահեստում').fill('5');
  await vis(a, 'Միացնել', { exact: true }).click(); await a.waitForTimeout(3000);
  ok('19. քանակից հետո՝ «Կա»', sql(`select in_stock from products where id = ${P('Թեստ պանիր')}`).includes('true'));
  await a.screenshot({ path: S + '/s19-activate.png' });
  ok('18. նոր ապրանքը ստեղծվեց', sql(`select count(*) n from products where id = ${P('Թեստ պանիր')}`).includes('"n":1'));
  // 20. Պահեստ
  await a.goto(BASE + '/firm/stock'); await a.waitForTimeout(2500);
  await vis(a, 'Թեստ ձու', { exact: true }).click(); await a.waitForTimeout(1200);
  await a.getByLabel(/^Քանակ, /).fill('100');
  await vis(a, 'Պահել', { exact: true }).click(); await a.waitForTimeout(2500);
  ok('20. մուտք 100', (await a.getByText(/Մնացորդ՝ 100/).count()) === 1);
  await vis(a, '🗑 Դուրս գրել').click(); await a.getByLabel(/^Քանակ, /).fill('10');
  await vis(a, 'Պահել', { exact: true }).click(); await a.waitForTimeout(2500);
  ok('20. դուրսգրում → 90', (await a.getByText(/Մնացորդ՝ 90/).count()) === 1);
  await vis(a, '📝 Փաստացի մնացորդ').click(); await a.getByLabel(/^Փաստացի կա, /).fill('0');
  await vis(a, 'Պահել', { exact: true }).click(); await a.waitForTimeout(2500);
  ok('20. 0 → ինքնաբերաբար «Չկա»', sql(`select in_stock from products where id = ${P('Թեստ ձու')}`).includes('false'));
  ok('20. պատմությունը 3 տող', (await a.getByText(/📥 Մուտք|🗑 Դուրսգրում|📝 Գույքագրում/).filter({ visible: true }).count()) >= 4);
  await a.screenshot({ path: S + '/s20-stock.png' });
  sql(`delete from stock_moves where product_id = ${P('Թեստ ձու')}; update products set in_stock = true where id = ${P('Թեստ ձու')};`);
  // 24. Վճարման ժամկետ
  await a.goto(BASE + '/admin'); await a.waitForTimeout(2500);
  await vis(a, 'Խանութներ', { exact: true }).click(); await a.waitForTimeout(900);
  await vis(a, 'Թեստ խանութ').click(); await a.waitForTimeout(2000);
  await a.getByLabel('Վճարման ժամկետ՝ առաքումից քանի օր հետո').fill('7');
  await vis(a, 'Պահել պայմանները').click(); await a.waitForTimeout(2500);
  ok('24. վճարման ժամկետը պահվեց', sql(`select payment_days from shop_firm_links where firm_id = ${F} and payment_days = 7`).includes('7'));
  // 21–22. Պատվերի ուղղում և փոխարինող (t-man)
  sql(`update products set in_stock = true where firm_id = ${F};`);
  sql(`with o as (insert into orders (shop_id, firm_id, manager_id, status, delivery_date)
         select l.shop_id, l.firm_id, l.manager_id, 'sent', current_date + 1 from shop_firm_links l
         join shop_members sm on sm.shop_id = l.shop_id join auth.users u on u.id = sm.user_id and u.email = 't-shop@demo.matakarar.com'
         where l.firm_id = ${F} returning id)
       insert into order_items (order_id, product_id, qty, price) select o.id, ${P('Թեստ ձու')}, 30, 60 from o
       union all select o.id, ${P('Թեստ կաթ 1 լ')}, 6, 777 from o;`);
  const m = await login(b, 't-man@demo.matakarar.com');
  await vis(m, /Փոխել քանակ \/ գին/).click(); await m.waitForTimeout(800);
  await m.getByLabel('Ուղարկվող քանակ').first().fill('20');
  await m.getByLabel('Գին այս պատվերի համար').first().fill('55');
  await vis(m, 'Պահել', { exact: true }).click(); await m.waitForTimeout(3000);
  ok('21. ուղղումը պահվեց', sql(`select count(*) n from order_items where sent_qty = 20 and final_price = 55`).includes('"n":1'));
  ok('21. հիմնական գինը չփոխվեց', sql(`select price from products where id = ${P('Թեստ ձու')}`).includes('60'));
  ok('21. ✏️ ընդգծումը երևում է', (await m.getByText(/✏️/).filter({ visible: true }).count()) >= 1);
  await vis(m, /Փոխել քանակ \/ գին/).click(); await m.waitForTimeout(800);
  await vis(m, '🔄 Առաջարկել փոխարինող').click(); await m.waitForTimeout(600);
  await vis(m, /Թեստ պանիր/).click();
  await vis(m, 'Առաջարկել', { exact: true }).click(); await m.waitForTimeout(2500);
  ok('22. փոխարինումը առաջարկված է', sql(`select count(*) n from order_items where sub_status = 'proposed'`).includes('"n":1'));
  await m.screenshot({ path: S + '/s21-edit.png' });
  const oid = JSON.parse(sql(`select order_id from order_items where sub_status = 'proposed'`).match(/\[.*\]/s)[0])[0].order_id;
  const s = await login(b, 't-shop@demo.matakarar.com');
  await s.goto(BASE + '/shop/order/' + oid); await s.waitForTimeout(3000);
  ok('22. խանութը տեսնում է առաջարկը', (await s.getByText(/Մատակարարը առաջարկում է փոխարինել/).count()) === 1);
  ok('21. խանութը տեսնում է ուղղումը', (await s.getByText(/✏️/).filter({ visible: true }).count()) >= 1);
  await s.screenshot({ path: S + '/s22-shop.png' });
  await vis(s, '✅ Համաձայն եմ').click(); await s.waitForTimeout(2500);
  ok('22. ընդունվեց', sql(`select count(*) n from order_items where sub_status = 'accepted' and product_id = ${P('Թեստ պանիր')}`).includes('"n":1'));
  // 23. Ակցիա միայն հաճախորդներին
  await m.goto(BASE + '/market'); await m.waitForTimeout(2500);
  await m.getByLabel('Ինչ եք առաջարկում').fill('Թեստ ակցիա հաճախորդներին');
  await vis(m, '🤝 Միայն իմ հաճախորդներին').click();
  await vis(m, '📣 Առաջարկել խանութներին').click(); await m.waitForTimeout(2500);
  ok('23. audience = clients', sql(`select audience from supplier_deals where text = 'Թեստ ակցիա հաճախորդներին'`).includes('clients'));
  const s2 = await login(b, 't-shop2@demo.matakarar.com');
  await s2.goto(BASE + '/market'); await s2.waitForTimeout(2500);
  await vis(s2, /Մատակարարները առաջարկում են/).click(); await s2.waitForTimeout(1200);
  ok('23. ոչ հաճախորդը չի տեսնում', (await s2.getByText('Թեստ ակցիա հաճախորդներին').count()) === 0);
  for (const [n, p] of [['boss', a], ['man', m], ['shop', s], ['shop2', s2]]) ok(`JS սխալ չկա (${n})`, p.errs.length === 0 || (console.log(p.errs), false));
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
