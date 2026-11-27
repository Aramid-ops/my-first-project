// Բրաուզերային թեստ՝ SPEC §28 (գծեր, հրավեր, թույլտվություններ, խանութի քարտ, հաշիվներ, ակտիվացում)
// Գործարկում. node tests/e2e/rules.js <նկարների պանակ> <SQL helper (sq.sh)>. Պետք է փորձնական հաշիվներ՝ t-boss@ և t-shop@demo.matakarar.com (տե՛ս SPEC §28)
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const S = process.argv[2], SQ = process.argv[3];
const fs = require('fs');
const sql = (q) => { fs.writeFileSync(S + '/q.sql', q); const out = execSync(`bash ${SQ} -f ${S}/q.sql`).toString(); if (!out.includes('HTTP 201')) throw new Error('SQL: ' + out); return out; };
const ok = (name, cond) => { console.log(`${cond ? '✅' : '❌'} ${name}`); if (!cond) process.exitCode = 1; };
async function login(b, email) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto('http://localhost:8099/my-first-project/'); await p.waitForTimeout(2500);
  await p.getByLabel('Էլ. փոստ').fill(email);
  await p.getByRole('textbox', { name: 'Գաղտնաբառ' }).fill('Test-12345x');
  await p.getByText('Մուտք', { exact: true }).click(); await p.waitForTimeout(5000);
  return p;
}
const tab = async (p, t) => { await p.getByText(t, { exact: true }).filter({ visible: true }).first().click(); await p.waitForTimeout(800); };
(async () => {
  const b = await chromium.launch();
  // 7. Նոր ֆիրմա → փակ, ակտիվացման էջ
  let a = await login(b, 't-boss@demo.matakarar.com');
  ok('7. նոր ֆիրման տեսնում է ակտիվացման էջը', (await a.getByText('🏦 Ակտիվացրեք ֆիրման').count()) === 1);
  ok('7. կոդը երևում է', (await a.getByText(/MTK-\d{4}/).count()) >= 1);
  await a.screenshot({ path: S + '/r7-activation.png' });
  // ակտիվացնում ենք (իբր մենք ստուգեցինք քաղվածքը), ավելացնում գծեր և խանութ
  sql(`update firms set verified = true where name = 'Թեստ Ֆիրմա';
       insert into lines (firm_id, name, delivery_days) select id, 'Բ գիծ', '{1,5}' from firms where name = 'Թեստ Ֆիրմա';
       insert into lines (firm_id, name, delivery_days) select id, 'Ա գիծ', '{2}' from firms where name = 'Թեստ Ֆիրմա';
       insert into shop_firm_links (shop_id, firm_id, manager_id, status) select sm.shop_id, f.id, null, 'active' from shop_members sm join auth.users u on u.id = sm.user_id and u.email = 't-shop@demo.matakarar.com', firms f where f.name = 'Թեստ Ֆիրմա';`);
  await a.close(); a = await login(b, 't-boss@demo.matakarar.com');
  // 1. Գծեր. փոխելուց հետո հերթականությունը նույնն է
  await tab(a, 'Գծեր');
  const order = async () => (await a.getByText(/^(Ա|Բ) գիծ · /).allInnerTexts()).map((t) => t[0]).join('');
  const before = await order();
  await a.getByLabel('Պատվերի վերջնաժամ (ժժ:րր)').first().fill('0530');
  await a.getByText('Պահել', { exact: true }).filter({ visible: true }).first().click(); await a.waitForTimeout(2500);
  ok(`1. գծերի հերթականությունը չփոխվեց (${before} → ${await order()})`, before === (await order()) && before === 'ԱԲ');
  ok('5. ցանկացած ժամ՝ 05:30 պահվեց', sql("select order_cutoff from lines where name = 'Ա գիծ'").includes('05:30'));
  ok('5. հիշեցման ընտրությունը երևում է', (await a.getByText('1 ժ առաջ').count()) >= 1);
  await a.screenshot({ path: S + '/r1-lines.png' });
  // 2. Հրավեր. կոդ + SMS / WhatsApp / Viber
  await tab(a, 'Աշխատողներ');
  await a.getByLabel('Անուն').fill('Թեստ Հաշվապահ');
  await a.getByLabel('Հեռախոս').fill('+374 77 123456');
  await a.getByText('Ստանալ հրավերի կոդ').click(); await a.waitForTimeout(2500);
  ok('2. կոդը ուղարկելու կոճակներ', (await a.getByText('WhatsApp', { exact: true }).count()) === 1 && (await a.getByText('SMS', { exact: true }).count()) === 1);
  ok('6. «Հաստատում է վճարումներ» անջատիչ', (await a.getByText('💳 Հաստատում է վճարումներ').count()) >= 1);
  await a.screenshot({ path: S + '/r2-invite.png' });
  // 4. Խանութներ ըստ թաղամասերի → քարտ → զեղչ
  await tab(a, 'Խանութներ');
  ok('4. թաղամասի խումբ «Ավան · 1 խանութ»', (await a.getByText('Ավան · 1 խանութ').count()) === 1);
  await a.getByText('Թեստ խանութ').first().click(); await a.waitForTimeout(2000);
  ok('4. քարտում՝ ամփոփում', (await a.getByText('Պատվիրել է').count()) === 1 && (await a.getByText('Վճարել է').count()) === 1);
  await a.getByLabel('Զեղչ, %').fill('5');
  await a.getByText('Պահել պայմանները').click(); await a.waitForTimeout(2500);
  ok('4. զեղչը պահվեց', sql("select discount_pct from shop_firm_links l join firms f on f.id = l.firm_id where f.name = 'Թեստ Ֆիրմա'").includes('5'));
  await a.screenshot({ path: S + '/r4-card.png' });
  // 3. Խանութ. պարտք չկա → «Վճարել եմ» չկա
  const s = await login(b, 't-shop@demo.matakarar.com');
  await s.getByLabel('Հաշիվներ').first().click(); await s.waitForTimeout(2000);
  ok('3. պարտք չկա → «Վճարել եմ» չի երևում', (await s.getByText('Վճարել եմ').count()) === 0);
  await s.screenshot({ path: S + '/r3-debts.png' });
  ok('էջերում JS սխալ չկա', [...a.errs, ...s.errs].length === 0);
  if ([...a.errs, ...s.errs].length) console.log(a.errs, s.errs);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
