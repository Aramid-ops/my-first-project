// Վարորդի օրերի ամփոփում՝ պատվերների պատմությունից (աշխատում է նաև առանց ինտերնետի)
import { estimateKm, type Point } from './geo';
import { toISODate } from './rules';
import type { Order } from './types';

export type DriverDay = {
  day: string; // YYYY-MM-DD
  stops: number; // առաքված կանգառներ
  startedAt?: string; // առաջին «Մեկնեց»
  lastDeliveryAt?: string;
  finishedAt?: string; // «Ավարտել օրը» (եթե սեղմվել է)
  km: number | null;
  shops: string[]; // shopId-ներ՝ առաքման հերթականությամբ
};

export type FinishedDayRow = { day: string; finished_at: string; km_estimate: number | null };

/** Վերջին `days` օրերը՝ նորից հին */
export function driverDays(orders: Order[], driverName: string, finished: FinishedDayRow[], days = 7, now = new Date()): DriverDay[] {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));

  type Ev = { at: string; text: string; shopId: string; p?: Point };
  const evs: Ev[] = [];
  for (const o of orders) {
    for (const e of o.events) {
      if (e.byName !== driverName) continue;
      if (e.text !== 'Մեկնեց' && e.text !== 'Առաքեց') continue;
      if (new Date(e.at) < from) continue;
      evs.push({ at: e.at, text: e.text, shopId: o.shopId, p: e.lat != null && e.lng != null ? { lat: e.lat, lng: e.lng } : undefined });
    }
  }
  evs.sort((a, b) => a.at.localeCompare(b.at));

  const byDay = new Map<string, Ev[]>();
  for (const e of evs) {
    const d = toISODate(new Date(e.at));
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }

  const result: DriverDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = toISODate(d);
    const list = byDay.get(key) ?? [];
    const delivered = list.filter((e) => e.text === 'Առաքեց');
    const fin = finished.find((f) => f.day === key);
    const points = list.map((e) => e.p).filter((p): p is Point => !!p);
    result.push({
      day: key,
      stops: delivered.length,
      startedAt: list.find((e) => e.text === 'Մեկնեց')?.at,
      lastDeliveryAt: delivered[delivered.length - 1]?.at,
      finishedAt: fin?.finished_at,
      km: fin?.km_estimate ?? estimateKm(points),
      shops: delivered.map((e) => e.shopId),
    });
  }
  return result;
}

/** Րոպեներ կեսգիշերից */
const minutesOfDay = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * Համեմատություն նախորդ օրերի հետ. դրական = այսօր ավելի շուտ է ավարտել։
 * null, եթե համեմատելու բան չկա։
 */
export function earlierThanUsualMin(today: DriverDay, previous: DriverDay[]): number | null {
  const end = today.finishedAt ?? today.lastDeliveryAt;
  if (!end) return null;
  const prev = previous.map((d) => d.finishedAt ?? d.lastDeliveryAt).filter((x): x is string => !!x);
  if (prev.length === 0) return null;
  const avg = prev.reduce((s, x) => s + minutesOfDay(x), 0) / prev.length;
  return Math.round(avg - minutesOfDay(end));
}

const dayNames = ['կիրակի', 'երկուշաբթի', 'երեքշաբթի', 'չորեքշաբթի', 'հինգշաբթի', 'ուրբաթ', 'շաբաթ'];
export function dayLabel(key: string, now = new Date()): string {
  const today = toISODate(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (key === today) return 'Այսօր';
  if (key === toISODate(y)) return 'Երեկ';
  const d = new Date(key + 'T00:00:00');
  return `${dayNames[d.getDay()]}, ${d.getDate()}.${`${d.getMonth() + 1}`.padStart(2, '0')}`;
}
