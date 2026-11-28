// Բազայից ամեն ինչի բեռնումը մեկ տեղում։ Առանց ինտերնետի՝ վերջին հաջողված պատկերը հեռախոսից։
import AsyncStorage from '@react-native-async-storage/async-storage';

import { mapDebt, mapDriverProfile, mapEmployee, mapFirm, mapIssue, mapLine, mapLink, mapOrder, mapPayment, mapProduct, mapSavedList, mapShop, mapTeams, mapTextOrder } from './mappers';
import type { Data, Session } from './store-types';
import { supabase } from './supabase';

export const emptyData: Data = {
  session: null,
  firms: [],
  employees: [],
  shops: [],
  links: [],
  products: [],
  orders: [],
  textOrders: [],
  teams: [],
  lines: [],
  issues: [],
  debts: [],
  payments: [],
  savedLists: [],
  driverProfile: null,
  isPlatformAdmin: false,
  prices: {},
  perms: [],
};

const cacheKey = (uid: string) => `snapshot:${uid}`;

async function fromCache(uid: string): Promise<Data | null> {
  const raw = await AsyncStorage.getItem(cacheKey(uid)).catch(() => null);
  return raw ? { ...emptyData, ...JSON.parse(raw) } : null;
}

/** null՝ եթե ոչ ինտերնետ կա, ոչ էլ պահված պատկեր */
export async function loadData(uid: string): Promise<Data | null> {
  // Բոլոր հարցումները՝ զուգահեռ
  const res = await Promise.all([
    supabase.from('firms').select('*'),
    supabase.from('employees').select('*'),
    supabase.from('shops').select('*'),
    supabase.from('shop_firm_links').select('*'),
    supabase.from('products').select('*').order('name'),
    // վերջին 90 օրը (ավելի հինը պետք չէ ամեն բացելիս բեռնել)
    supabase
      .from('orders')
      .select('*, order_items(*), order_events(*)')
      .gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('teams').select('*').order('name'),
    supabase.from('team_members').select('*'),
    supabase.from('lines').select('*').order('name'),   // կայուն հերթականություն (փոխելիս չեն տեղաշարժվում)
    supabase.from('order_issues').select('*').order('created_at', { ascending: false }),
    supabase.rpc('debts'),
    supabase.from('payments').select('*').order('marked_paid_by_shop_at', { ascending: false }),
    supabase.from('platform_admins').select('user_id').maybeSingle(),
    supabase.from('driver_profiles').select('*').eq('user_id', uid).maybeSingle(),
    supabase.from('employees').select('id, role').eq('user_id', uid).maybeSingle(),
    supabase.from('shop_members').select('shop_id').eq('user_id', uid).maybeSingle(),
    supabase
      .from('text_orders')
      .select('*')
      .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (res.some((r) => r.error)) return fromCache(uid);
  const [f, e, s, l, p, o, tm, tmm, ln, iss, dbt, pay, pa, dp, me, member, txt] = res;
  // ժամկետանց պարտքեր. սխալի դեպքում՝ պարզապես դատարկ (մնացածը չի տուժում)
  const overdue = ((await supabase.rpc('overdue_debts')).data ?? []) as { shop_id: string; firm_id: string; overdue: number; days_late: number }[];

  const lines = (ln.data ?? []).map(mapLine);
  const session: Session = member.data
    ? { kind: 'shop', shopId: member.data.shop_id }
    : me.data
      ? { kind: 'employee', employeeId: me.data.id, role: me.data.role }
      : dp.data
        ? { kind: 'driverSelf' }
        : { kind: 'none' };
  const data: Data = {
    ...emptyData,
    session,
    firms: (f.data ?? []).map(mapFirm),
    employees: (e.data ?? []).map(mapEmployee),
    shops: (s.data ?? []).map(mapShop),
    // Եթե խանութը գծի վրա է, առաքման օրերը վերցվում են գծից
    links: (l.data ?? []).map(mapLink).map((x) => {
      const line = lines.find((y) => y.id === x.lineId);
      return line ? { ...x, deliveryDays: line.deliveryDays } : x;
    }),
    products: (p.data ?? []).map(mapProduct),
    orders: (o.data ?? []).map(mapOrder),
    textOrders: (txt.data ?? []).map(mapTextOrder),
    teams: mapTeams(tm.data ?? [], tmm.data ?? []),
    lines,
    issues: (iss.data ?? []).map(mapIssue),
    debts: ((dbt.data ?? []) as unknown[]).map(mapDebt).map((d) => {
      const x = overdue.find((y) => y.shop_id === d.shopId && y.firm_id === d.firmId && Number(y.overdue) > 0);
      return x ? { ...d, overdue: Number(x.overdue), daysLate: x.days_late } : d;
    }),
    payments: (pay.data ?? []).map(mapPayment),
    isPlatformAdmin: !!pa.data,
    perms: [],
    driverProfile: dp.data ? mapDriverProfile(dp.data) : null,
    prices: {},
  };

  // Աշխատողի համար՝ իր թույլտվությունները (կոճակները ցույց տալու համար. բազան էլ է ստուգում)
  if (session.kind === 'employee') data.perms = ((await supabase.rpc('my_permissions')).data ?? []) as Data['perms'];

  // Խանութի համար՝ իր գները և պահված ցուցակները
  if (session.kind === 'shop') {
    const firmIds = data.links.filter((x) => x.status === 'active').map((x) => x.firmId);
    const [pr, sl] = await Promise.all([
      Promise.all(firmIds.map((fid) => supabase.rpc('my_prices', { p_firm: fid }))),
      supabase.from('saved_lists').select('*').order('created_at', { ascending: false }),
    ]);
    for (const r of pr) for (const row of (r.data ?? []) as { product_id: string; price: number }[]) data.prices[row.product_id] = Number(row.price);
    data.savedLists = (sl.data ?? []).map(mapSavedList);
  }

  AsyncStorage.setItem(cacheKey(uid), JSON.stringify(data)).catch(() => {});
  return data;
}
