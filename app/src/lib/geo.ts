// Տեղորոշում միայն գործողության պահին («Մեկնեցի» / «Առաքված»)։ Անընդհատ հետևում չկա։
import * as Location from 'expo-location';

import type { Point } from './distance';

export { estimateKm, haversineKm, type Point } from './distance';


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
