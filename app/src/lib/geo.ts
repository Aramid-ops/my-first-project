// Տեղորոշում միայն գործողության պահին («Մեկնեցի» / «Առաքված»)։ Անընդհատ հետևում չկա։
import * as Location from 'expo-location';

export type Point = { lat: number; lng: number };

let permission: boolean | null = null;

/** Ներկա տեղը կամ null (եթե թույլտվություն չկա կամ 6 վայրկյանում չստացվեց) */
export async function currentPoint(): Promise<Point | null> {
  try {
    if (permission === null) {
      const r = await Location.requestForegroundPermissionsAsync();
      permission = r.granted;
    }
    if (!permission) return null;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((res) => setTimeout(() => res(null), 6000)),
    ]);
    if (!pos) {
      const last = await Location.getLastKnownPositionAsync();
      return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
    }
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/** Ուղիղ գծով հեռավորություն, կմ */
export function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Մոտավոր կիլոմետրաժ. կետերի միջև ուղիղ հեռավորությունների գումար × 1.3
 * (քաղաքում ճանապարհը միջինում ~30%-ով ավելի երկար է, քան ուղիղ գիծը)
 */
export function estimateKm(points: Point[]): number | null {
  if (points.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversineKm(points[i - 1], points[i]);
  return Math.round(sum * 1.3 * 10) / 10;
}
