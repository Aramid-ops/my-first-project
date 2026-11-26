// Վարորդի աշխատանք առանց ինտերնետի.
// · երթուղին և պատվերները պահվում են հեռախոսում (store-ի snapshot)
// · «Մեկնեցի» / «Առաքված» գործողությունները գրվում են տեղական հերթում (outbox)
// · երբ ինտերնետը վերադառնում է, հերթը ուղարկվում է բազա՝ իրական ժամերով
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

import { supabase } from './supabase';
import type { Order, OrderStatus, Shop } from './types';

export type DriverAction = {
  id: string;
  orderId: string;
  status: Extract<OrderStatus, 'on_the_way' | 'delivered'>;
  at: string; // երբ իրականում սեղմվեց
};

const key = (uid: string) => `driver-outbox:${uid}`;

export async function loadOutbox(uid: string): Promise<DriverAction[]> {
  const raw = await AsyncStorage.getItem(key(uid)).catch(() => null);
  return raw ? (JSON.parse(raw) as DriverAction[]) : [];
}

export async function saveOutbox(uid: string, list: DriverAction[]) {
  await AsyncStorage.setItem(key(uid), JSON.stringify(list)).catch(() => {});
}

/** Պատվերների վրա կիրառում ենք դեռ չուղարկված գործողությունները */
export function applyOutbox(orders: Order[], outbox: DriverAction[]): Order[] {
  if (outbox.length === 0) return orders;
  const last = new Map<string, DriverAction>();
  for (const a of outbox) last.set(a.orderId, a);
  return orders.map((o) => (last.has(o.id) ? { ...o, status: last.get(o.id)!.status } : o));
}

const eventText: Record<DriverAction['status'], string> = {
  on_the_way: 'Մեկնեց',
  delivered: 'Առաքեց',
};

/**
 * Ուղարկում է հերթը հերթականությամբ։ Սխալի դեպքում կանգ է առնում
 * (մնացածը կուղարկվի հաջորդ փորձին)։ Վերադարձնում է չուղարկվածները։
 */
export async function syncOutbox(uid: string): Promise<DriverAction[]> {
  let list = await loadOutbox(uid);
  while (list.length > 0) {
    const a = list[0];
    const up = await supabase.from('orders').update({ status: a.status }).eq('id', a.orderId);
    if (up.error) break;
    const ev = await supabase.from('order_events').insert({ order_id: a.orderId, actor_name: '', text: eventText[a.status], at: a.at });
    if (ev.error) break;
    list = list.slice(1);
    await saveOutbox(uid, list);
  }
  return list;
}

/** Yandex Navigator (եթե կա) → Yandex Maps (բրաուզեր) */
export async function openRoute(shop: Shop) {
  const hasCoords = shop.lat != null && shop.lng != null;
  const web = hasCoords
    ? `https://yandex.ru/maps/?rtext=~${shop.lat},${shop.lng}&rtt=auto`
    : `https://yandex.ru/maps/?text=${encodeURIComponent(`${shop.city}, ${shop.address}`)}`;
  if (Platform.OS !== 'web' && hasCoords) {
    try {
      await Linking.openURL(`yandexnavi://build_route_on_map?lat_to=${shop.lat}&lon_to=${shop.lng}`);
      return;
    } catch {
      // Նավիգատորը տեղադրված չէ
    }
  }
  await Linking.openURL(web);
}
