// Ավտոմատ թեստեր (առանց հեռախոսի). npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { driverDays, earlierThanUsualMin } from '../src/lib/driver-stats';
import { orderByNearest } from '../src/lib/route';
import { decQty, incQty, isValidPhone, isValidQty, nextDeliveryDate, normalizePhone, orderDeadlineLabel } from '../src/lib/rules';
import { matches, searchSkeleton, startsWithWord } from '../src/lib/search';
import type { Product } from '../src/lib/types';

test('որոնում. հայերեն / ռուսերեն / լատինատառ նույն արդյունքն են տալիս', () => {
  for (const [a, b, c] of [
    ['Զուգարանի թուղթ', 'зугарани тухт', 'zugarani tught'],
    ['Լավաշ', 'лаваш', 'lavash'],
    ['Մատնաքաշ', 'матнакаш', 'matnaqash'],
  ]) {
    assert.equal(searchSkeleton(a), searchSkeleton(b));
    assert.equal(searchSkeleton(a), searchSkeleton(c));
  }
  assert.ok(matches('Կաթ 3.2%, 1 լ', 'кат'));
  assert.ok(matches('Հեղուկ օճառ', 'hexuk'));
  assert.ok(!matches('Լավաշ', 'կաթ'));
  assert.ok(startsWithWord('Աթենք', 'աթ'));
  assert.ok(!startsWithWord('Կաթնաշխարհ', 'աթ'));
  assert.ok(startsWithWord('Սրճարան «Կետ»', 'кет'));
});

const toilet = { id: 'p', firmId: 'f', name: 't', unit: 'հատ', price: 150, minQty: 30, step: 30, inStock: true } as Product;
const cheese = { id: 'c', firmId: 'f', name: 'c', unit: 'կգ', price: 3200, minQty: 1, step: 0.5, weighed: true, inStock: true } as Product;

test('քանակ. նվազագույն և քայլ', () => {
  assert.equal(incQty(toilet, 0), 30);
  assert.equal(incQty(toilet, 30), 60);
  assert.equal(decQty(toilet, 30), 0);
  assert.ok(isValidQty(toilet, 90));
  assert.ok(!isValidQty(toilet, 15));
  assert.equal(incQty(cheese, 1), 1.5);
});

test('առաքման օր. գիծ + վերջնաժամ', () => {
  const wed10 = new Date('2026-11-25T10:00:00'); // չորեքշաբթի
  assert.equal(nextDeliveryDate([4], wed10).getDay(), 4); // հինգշաբթի
  const wed19 = new Date('2026-11-25T19:00:00');
  // 18:00-ից հետո վաղվա գիծը բաց է թողնվում → հաջորդ հինգշաբթի
  assert.equal(nextDeliveryDate([4], wed19, '18:00').getDate(), 3);
  assert.equal(nextDeliveryDate([], wed10).getDate(), 26); // ամեն օր → վաղը
});

test('երթուղի. բազայից մոտիկից հեռու, առանց կոորդինատների՝ վերջում', () => {
  const shops = [
    { n: 'Կետ', p: { lat: 40.196, lng: 44.476 } },
    { n: 'Ծիրան', p: { lat: 40.212, lng: 44.452 } },
    { n: 'Առանց', p: null },
    { n: 'Նոր օր', p: { lat: 40.18, lng: 44.49 } },
  ];
  const order = orderByNearest(shops, (s) => s.p, { lat: 40.153, lng: 44.474 }).map((s) => s.n);
  assert.deepEqual(order, ['Նոր օր', 'Կետ', 'Ծիրան', 'Առանց']);
});

test('վարորդի օր. կանգառներ և «ավելի շուտ, քան սովորաբար»', () => {
  const ev = (at: string, text: string) => ({ at: new Date(at).toISOString(), byName: 'Ա', text });
  const orders = [
    { shopId: 's1', events: [ev('2026-11-26T09:00:00', 'Մեկնեց'), ev('2026-11-26T15:00:00', 'Առաքեց')] },
    { shopId: 's1', events: [ev('2026-11-25T09:00:00', 'Մեկնեց'), ev('2026-11-25T16:00:00', 'Առաքեց')] },
  ] as never[];
  const days = driverDays(orders, 'Ա', [], 7, new Date('2026-11-26T18:00:00'));
  assert.equal(days[0].stops, 1);
  assert.equal(earlierThanUsualMin(days[0], days.slice(1).filter((d) => d.stops)), 60);
});

test('հեռախոսահամար. ձևաչափ և ստուգում', () => {
  assert.equal(normalizePhone('+374 77 12-34-56'), '+37477123456');
  assert.equal(normalizePhone('077 123456'), '+37477123456');
  assert.equal(normalizePhone('77123456'), '+37477123456');
  assert.equal(normalizePhone('+7 999 123 45 67'), '+79991234567');
  assert.ok(isValidPhone('+374 77 123456'));
  assert.ok(!isValidPhone('+374 77 1234')); // պակաս թիվ
  assert.ok(!isValidPhone('+374 77 1234567')); // ավել թիվ
  assert.ok(isValidPhone('+7 999 123 45 67'));
  assert.ok(!isValidPhone('+374'));
});

test('վերջնաժամ. առաքումից մեկ օր առաջ, ժամով', () => {
  // Երկ/ուրբ առաքում, 17:00. կիրակի 10:00-ին → երկուշաբթի, պատվիրել «այսօր մինչև 17:00»
  const sun10 = new Date(2026, 10, 29, 10, 0); // 29.11.2026 կիրակի
  const d1 = nextDeliveryDate([1, 5], sun10, '17:00');
  assert.equal(d1.getDay(), 1);
  assert.equal(orderDeadlineLabel(d1, '17:00', sun10), 'այսօր մինչև 17:00');
  // կիրակի 18:00 → ուրբաթ, պատվիրել հինգշաբթի մինչև 17:00
  const sun18 = new Date(2026, 10, 29, 18, 0);
  const d2 = nextDeliveryDate([1, 5], sun18, '17:00');
  assert.equal(d2.getDay(), 5);
  assert.equal(orderDeadlineLabel(d2, '17:00', sun18), 'հինգշաբթի մինչև 17:00');
});

test('Excel ներմուծում. նոր / թարմացվող / գնի փոփոխություն / սխալ', async () => {
  const { buildPreview, csvRows } = await import('../src/lib/product-import');
  const existing = [{ id: 'p1', firmId: 'f', name: 'Ձու C0', unit: 'հատ', price: 55, minQty: 30, step: 30, inStock: true }] as never[];
  const t = csvRows('անվանում;միավոր;գին;կատեգորիա\nձու c0;հատ;60;Ձու\nԿաթ;լ;450;Անհայտ\nՊանիր;կգ;;\nՍոուս;շիշ;300;');
  const p = buildPreview(t, existing);
  assert.equal(p.added.length, 1);
  assert.equal(p.updated.length, 1);
  assert.deepEqual(p.priceChanges, [{ name: 'ձու c0', from: 55, to: 60 }]);
  assert.equal(p.errors.length, 2); // գին չկա, «շիշ» միավոր չկա
  assert.equal(p.added[0].category, 'Անհայտ'); // նոր կատեգորիա՝ ինչպես գրված է
  assert.deepEqual(p.newCategories, ['Անհայտ']);
  assert.equal(p.updated[0].category, 'Ձու'); // ստանդարտը
  assert.equal(buildPreview([['x', 'y']], []).errors.length, 1);
  assert.equal(buildPreview(csvRows('անվանում,գին,կատեգորիա\nԱջիկա,900,պահածո'), []).added[0].category, 'Պահածոներ');
});

test('Excel ներմուծում. նույն անունը երկու անգամ՝ սխալ', async () => {
  const { buildPreview, csvRows } = await import('../src/lib/product-import');
  const p = buildPreview(csvRows('անվանում,գին\nՁու,60\nձու,65'), []);
  assert.equal(p.added.length, 1);
  assert.equal(p.errors.length, 1);
});
