// Բրաուզերային թեստ՝ SPEC §29 (թույլտվություններ, գծեր, սև ցուցակ, համագործակցություն, Live շուկա → չաթ)
// Գործարկում. node tests/e2e/market-perms.js <նկարների պանակ> <SQL helper (sq.sh)>. Հաշիվներ՝ t-boss@, t-shop@, t-shop2@demo.matakarar.com
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const S = process.argv[2], SQ = process.argv[3];
const sql = (q) => { fs.writeFileSync(S + '/q.sql', q); const out = execSync(`bash ${SQ} -f ${S}/q.sql`).toString(); if (!out.includes('HTTP 201')) throw new Error('SQL: ' + out); return out; };
const ok = (name, cond) => { console.log(`${cond ? '✅' : '❌'} ${name}`); if (!cond) process.exitCode = 1; };
async function login(b, email) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto('http://localhost:8099/my-first-project/'); await p.waitForTimeout(2500);
  await p.getByLabel('Էլ. փոստ').fill(email);
  await p.getByRole('textbox', { name: 'Գաղտնաբառ' }).fill('Test-12345x');
  await p.getByText('Մուտք', { exact: true }).click(); await p.waitForTimeout(5000);
  return p;
}
const vis = (p, t, o = {}) => p.getByText(t, o).filter({ visible: true }).first();
const tab = async (p, t) => { await vis(p, t, { exact: true }).click(); await p.waitForTimeout(900); };
(async () => {
  sql(`update firms set verified = true where name = 'Թեստ Ֆիրմա';
       insert into shop_firm_links (shop_id, firm_id, status) select sm.shop_id, f.id, 'active' from shop_members sm join auth.users u on u.id = sm.user_id and u.email = 't-shop@demo.matakarar.com', firms f where f.name = 'Թեստ Ֆիրմա';`);
  const b = await chromium.launch();
  const a = await login(b, 't-boss@demo.matakarar.com');
  // 13. Թույլտվություններ
  await tab(a, 'Աշխատողներ');
  await vis(a, /Թույլտվություններ \(ում/).click(); await a.waitForTimeout(2000);
  ok('13. 🔐 էջը բացվեց', (await a.getByText('⚙️ Խանութների պայմաններ (զեղչ, սահմանաչափ)').count()) === 1);
  await a.getByLabel('⚙️ Խանութների պայմաններ (զեղչ, սահմանաչափ)').click(); await a.waitForTimeout(1500);
  ok('13. մենեջերների համար փակվեց (բազայում)', sql("select allowed from firm_perms where target = 'role:manager' and perm = 'shop_terms'").includes('false'));
  await a.screenshot({ path: S + '/p13-perms.png' });
  await vis(a, '‹').click(); await a.waitForTimeout(800);
  // 10. Գծեր. նոր (վերևում), անուն, ջնջել, խանութներ
  await tab(a, 'Գծեր');
  await a.getByLabel('➕ Նոր գիծ (օր.՝ Ավան)').fill('Գ գիծ');
  await vis(a, '+ Ավելացնել գիծ').click(); await a.waitForTimeout(2000);
  ok('10. նոր գիծը ստեղծվեց', (await a.getByText('Գ գիծ', { exact: true }).count()) === 1);
  await a.getByLabel('Փոխել անունը').first().click(); await a.waitForTimeout(400);
  await a.getByLabel('Գծի անունը').fill('Ավան');
  await vis(a, 'Պահել', { exact: true }).click(); await a.waitForTimeout(2000);
  ok('10. անունը փոխվեց', (await a.getByText('Ավան', { exact: true }).count()) >= 1);
  await vis(a, /🏪 Խանութներ \(0\)/).click(); await a.waitForTimeout(500);
  await vis(a, 'Թեստ խանութ', { exact: true }).click(); await a.waitForTimeout(2000);
  ok('10. խանութը դրվեց գծի վրա', (await a.getByText(/🏪 Խանութներ \(1\)/).count()) === 1);
  await a.screenshot({ path: S + '/p10-lines.png' });
  await a.getByLabel('Ջնջել գիծը').first().click(); await a.waitForTimeout(2000);
  ok('10. գիծը ջնջվեց', (await a.getByText('Ավան', { exact: true }).count()) === 0);
  // 12. Սև ցուցակ
  await tab(a, 'Խանութներ');
  await vis(a, 'Թեստ խանութ').click(); await a.waitForTimeout(2000);
  await a.getByLabel('Պատճառը (տեսնում է միայն ֆիրման)').fill('չվճարված պարտք');
  await vis(a, '⛔ Ավելացնել սև ցուցակ').click(); await a.waitForTimeout(2000);
  ok('12. սև ցուցակում է', (await a.getByText('⛔ Սև ցուցակում է').count()) === 1);
  await a.screenshot({ path: S + '/p12-blacklist.png' });
  await vis(a, '‹').click(); await a.waitForTimeout(800);
  // 10. Համագործակցություն t-shop2-ին
  await vis(a, /Բոլոր խանութները/).click(); await a.waitForTimeout(2500);
  // միայն փորձնական խանութը (ոչ իրական հաշիվներ)
  await a.getByLabel('Որոնել խանութ').fill('Թեստ խանութ 2'); await a.waitForTimeout(800);
  ok('10. որոնումը թողեց միայն մեկ խանութ', (await a.getByText('🤝 Առաջարկել համագործակցություն').filter({ visible: true }).count()) === 1);
  await a.getByText('🤝 Առաջարկել համագործակցություն').filter({ visible: true }).first().click(); await a.waitForTimeout(2000);
  ok('10. առաջարկը ուղարկվեց հենց «Թեստ խանութ 2»-ին', sql("select s.name from shop_firm_links l join shops s on s.id = l.shop_id where l.initiated_by = 'firm'").includes('Թեստ խանութ 2'));
  const s2 = await login(b, 't-shop2@demo.matakarar.com');
  ok('10. խանութը տեսնում է «🤝 … ցանկանում է»', (await s2.getByText(/ցանկանում է լինել ձեր մատակարարը/).count()) >= 1);
  await s2.screenshot({ path: S + '/p10-offer.png' });
  await vis(s2, 'Ընդունել', { exact: true }).click(); await s2.waitForTimeout(2500);
  ok('10. ընդունեց → ակտիվ', sql("select status from shop_firm_links where initiated_by = 'firm'").includes('active'));
  // 12. Սև ցուցակի խանութը տեսնում է մեղմ գրություն
  const s = await login(b, 't-shop@demo.matakarar.com');
  await vis(s, 'Թեստ Ֆիրմա').click(); await s.waitForTimeout(2000);
  ok('12. խանութը տեսնում է «ժամանակավորապես անհասանելի»', (await s.getByText(/ժամանակավորապես անհասանելի/).count()) === 1);
  await vis(s, '‹').click(); await s.waitForTimeout(800);
  // 8–9. Live շուկա. քանակ, միավոր, գին → առաջարկ → չաթ
  await vis(s, 'Live շուկա').click(); await s.waitForTimeout(2000);
  await s.getByLabel('Ինչ ապրանք եք փնտրում').fill('Ձու C0');
  await s.getByLabel('Քանակ').fill('300');
  await s.getByLabel('Գին').fill('60');
  await s.screenshot({ path: S + '/p8-market-form.png' });
  await vis(s, '🔎 Գտնել մատակարար').click(); await s.waitForTimeout(2500);
  ok('8. հարցումը՝ «300 հատ · ցանկալի՝ 60 ֏/հատ»', (await s.getByText(/300 հատ · ցանկալի՝ 60/).count()) >= 1);
  await a.goto('http://localhost:8099/my-first-project/'); await a.waitForTimeout(4000);
  await tab(a, 'Խանութներ'); await vis(a, /Live շուկա/).click(); await a.waitForTimeout(2500);
  await vis(a, /Խանութները ուզում են/).click(); await a.waitForTimeout(900);
  // միայն փորձնական հարցմանը (ոչ իրական հարցումներին)
  const req = a.getByText('🛒 Ձու C0', { exact: true }).locator('xpath=ancestor::div[.//div[text()="💼 Առաջարկել"]][1]');
  ok('9. փորձնական հարցումը գտնվեց', (await req.count()) === 1);
  await req.getByText('💼 Առաջարկել').click(); await a.waitForTimeout(400);
  await a.getByLabel('Ձեր առաջարկը').fill('Ունենք, 58 ֏, առաքում վաղը');
  await vis(a, 'Ուղարկել', { exact: true }).click(); await a.waitForTimeout(2500);
  ok('9. առաջարկը գնաց անձնական չաթ', sql("select count(*) from messages where body like '💼 Առաջարկ ձեր «Ձու C0»%'").includes(':1'));
  await s.waitForTimeout(2500);
  ok('9. խանութը տեսնում է «💼 Ստացել է 1 առաջարկ»', (await s.getByText(/Ստացել է 1 առաջարկ/).count()) === 1);
  await s.screenshot({ path: S + '/p9-offers.png' });
  ok('էջերում JS սխալ չկա', [...a.errs, ...s.errs, ...s2.errs].length === 0);
  if ([...a.errs, ...s.errs, ...s2.errs].length) console.log(a.errs, s.errs, s2.errs);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
