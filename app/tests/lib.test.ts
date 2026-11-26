// Ավտոմատ թեստեր (առանց հեռախոսի). npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { driverDays, earlierThanUsualMin } from '../src/lib/driver-stats';
import { orderByNearest } from '../src/lib/route';
import { decQty, incQty, isValidQty, nextDeliveryDate } from '../src/lib/rules';
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
