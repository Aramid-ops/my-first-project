// Վարորդի աշխատանք առանց ինտերնետի.
// · երթուղին և պատվերները պահվում են հեռախոսում (store-ի snapshot)
// · «Մեկնեցի» / «Առաքված» գործողությունները գրվում են տեղական հերթում (outbox)
// · երբ ինտերնետը վերադառնում է, հերթը ուղարկվում է բազա՝ իրական ժամերով
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

import { supabase } from './supabase';
import type { Order, OrderStatus, Shop } from './types';

export type DriverAction =
  | {
      kind?: 'status';
      id: string;
      orderId: string;
      status: Extract<OrderStatus, 'on_the_way' | 'delivered'>;
      at: string; // երբ իրականում սեղմվեց
      lat?: number;
      lng?: number;
    }
  | {
      kind: 'checkin';
      id: string;
      driverId: string;
      firmId: string;
      day: string; // YYYY-MM-DD
      at: string;
    }
  | {
      kind: 'finish';
      id: string;
      driverId: string;
      firmId: string;
      day: string; // YYYY-MM-DD
      at: string;
      startedAt?: string;
      stops: number;
      km: number | null;
    };

type StatusAction = Extract<DriverAction, { orderId: string }>;

const key = (uid: string) => `driver-outbox:${uid}`;

export async function loadOutbox(uid: string): Promise<DriverAction[]> {
  const raw = await AsyncStorage.getItem(key(uid)).catch(() => null);
  return raw ? (JSON.parse(raw) as DriverAction[]) : [];
}

export async function saveOutbox(uid: string, list: DriverAction[]) {
  await AsyncStorage.setItem(key(uid), JSON.stringify(list)).catch(() => {});
}

const eventText: Record<StatusAction['status'], string> = {
  on_the_way: 'Մեկնեց',
  delivered: 'Առաքեց',
};

/** Պատվերների վրա կիրառում ենք դեռ չուղարկված գործողությունները */
export function applyOutbox(orders: Order[], outbox: DriverAction[], driverName = ''): Order[] {
  if (outbox.length === 0) return orders;
  const byOrder = new Map<string, StatusAction[]>();
  for (const a of outbox) if (a.kind !== 'finish' && a.kind !== 'checkin') byOrder.set(a.orderId, [...(byOrder.get(a.orderId) ?? []), a]);
  return orders.map((o) => {
    const acts = byOrder.get(o.id);
    if (!acts) return o;
    return {
      ...o,
      status: acts[acts.length - 1].status,
      // Չուղարկված գործողությունները ավելացնում ենք պատմությանը, որ ամփոփումը ճիշտ լինի offline
      events: [...o.events, ...acts.map((x) => ({ at: x.at, byName: driverName, text: eventText[x.status], lat: x.lat, lng: x.lng }))],
    };
  });
}

/**
 * Ուղարկում է հերթը հերթականությամբ։ Սխալի դեպքում կանգ է առնում
 * (մնացածը կուղարկվի հաջորդ փորձին)։ Վերադարձնում է չուղարկվածները։
 */
export async function syncOutbox(uid: string): Promise<DriverAction[]> {
  let list = await loadOutbox(uid);
  while (list.length > 0) {
    const a = list[0];
    if (a.kind === 'checkin') {
      const r = await supabase.from('driver_checkins').upsert({ driver_id: a.driverId, firm_id: a.firmId, day: a.day, checked_in_at: a.at }, { ignoreDuplicates: true });
      if (r.error) break;
    } else if (a.kind === 'finish') {
      const r = await supabase.from('driver_days').upsert({
        driver_id: a.driverId,
        firm_id: a.firmId,
        day: a.day,
        started_at: a.startedAt ?? null,
        finished_at: a.at,
        stops_delivered: a.stops,
        km_estimate: a.km,
      });
      if (r.error) break;
    } else {
      const up = await supabase.from('orders').update({ status: a.status }).eq('id', a.orderId);
      if (up.error) break;
      const ev = await supabase
        .from('order_events')
        .insert({ order_id: a.orderId, actor_name: '', text: eventText[a.status], at: a.at, lat: a.lat ?? null, lng: a.lng ?? null });
      if (ev.error) break;
    }
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
