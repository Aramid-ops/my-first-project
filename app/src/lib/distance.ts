// Հեռավորություններ (առանց Expo կախվածությունների՝ թեստերի համար)
export type Point = { lat: number; lng: number };

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
