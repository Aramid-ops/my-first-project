import type { Employee, Firm, Product, Weekday } from './types';

/** Քանակի հաջորդ արժեքը «+» սեղմելիս. 0 → նվազագույն, հետո՝ քայլով */
export function incQty(p: Product, qty: number): number {
  if (qty < p.minQty) return p.minQty;
  return round(qty + p.step);
}

/** Քանակի նախորդ արժեքը «−» սեղմելիս. նվազագույնից ցածր → 0 */
export function decQty(p: Product, qty: number): number {
  const next = round(qty - p.step);
  return next < p.minQty ? 0 : next;
}

/** Ճի՞շտ է քանակը ըստ նվազագույնի և քայլի */
export function isValidQty(p: Product, qty: number): boolean {
  if (qty === 0) return true;
  if (qty < p.minQty) return false;
  const k = (qty - p.minQty) / p.step;
  return Math.abs(k - Math.round(k)) < 1e-9;
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

const weekdayNames = ['', 'երկուշաբթի', 'երեքշաբթի', 'չորեքշաբթի', 'հինգշաբթի', 'ուրբաթ', 'շաբաթ', 'կիրակի'];

/** JS-ի getDay() (0 = կիրակի) → 1..7 (1 = երկուշաբթի) */
export function weekdayOf(d: Date): Weekday {
  const js = d.getDay();
  return (js === 0 ? 7 : js) as Weekday;
}

/**
 * Առաքման հաջորդ օրը՝ ըստ գծի օրերի (§4.2)։
 * Պատվերը ամենաշուտը վաղն է առաքվում; դատարկ ցուցակ = ամեն օր։
 */
export function nextDeliveryDate(days: Weekday[], from: Date = new Date(), cutoff?: string): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  // Վերջնաժամից հետո՝ վաղվա գիծը բաց է թողնվում (պատվերը գնում է հաջորդ գծին)
  const late = !!cutoff && `${`${from.getHours()}`.padStart(2, '0')}:${`${from.getMinutes()}`.padStart(2, '0')}` >= cutoff;
  for (let i = late ? 2 : 1; i <= 8; i++) {
    const c = new Date(d);
    c.setDate(d.getDate() + i);
    if (days.length === 0 || days.includes(weekdayOf(c))) return c;
  }
  return d;
}

export function deliveryLabel(date: Date, from: Date = new Date()): string {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - a.getTime()) / 86400000);
  if (diff === 1) return 'վաղը';
  return weekdayNames[weekdayOf(date)];
}

export function toISODate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function formatAmd(n: number): string {
  return `${Math.round(n).toLocaleString('en-US').replace(/,/g, ' ')} ֏`;
}

export function formatQty(p: Product, qty: number): string {
  return `${p.weighed ? 'մոտ ' : ''}${qty} ${p.unit}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
}

/** «27.11 · 18:40» */
export function formatDayTime(iso: string): string {
  const d = new Date(iso);
  return `${`${d.getDate()}`.padStart(2, '0')}.${`${d.getMonth() + 1}`.padStart(2, '0')} · ${formatTime(iso)}`;
}

/** Հեռախոսահամար՝ «+» և միայն թվեր (օր.՝ «077 12-34-56» → «+37477123456») */
export function normalizePhone(v: string): string {
  let d = v.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 9 && d.startsWith('0')) d = `374${d.slice(1)}`; // 0XX XXXXXX → Հայաստան
  else if (d.length === 8) d = `374${d}`;
  return d ? `+${d}` : '';
}

/** Հայաստան՝ +374 և 8 թիվ; այլ երկրներ՝ 10–15 թիվ */
export function isValidPhone(v: string): boolean {
  const d = normalizePhone(v).slice(1);
  return d.startsWith('374') ? d.length === 11 : d.length >= 10 && d.length <= 15;
}

/** Մինչև երբ պատվիրել, որ հասցնի այս առաքմանը. «այսօր մինչև 17:00» / «կիրակի մինչև 17:00» (առաքումից մեկ օր առաջ) */
export function orderDeadlineLabel(delivery: Date, cutoff?: string, from: Date = new Date()): string {
  const day = new Date(delivery);
  day.setDate(day.getDate() - 1);
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  day.setHours(0, 0, 0, 0);
  const name = day.getTime() === a.getTime() ? 'այսօր' : weekdayNames[weekdayOf(day)];
  return cutoff ? `${name} մինչև ${cutoff}` : `${name} ներառյալ`;
}

/** Ֆիրման ունի՞ գործող ղեկավար (նույնը, ինչ բազայում՝ firm_has_admin). եթե ոչ՝ մենեջերը ինքն է հաստատում և կարգավորում */
export function firmHasAdmin(employees: Employee[], firm?: Firm): boolean {
  return !!firm && firm.verified !== false && employees.some((e) => e.firmId === firm.id && e.role === 'admin' && e.active !== false && e.hasAccount);
}

/** «Աջափնյակ, Կոմիտաս 5». թաղամասը չի կրկնվում, եթե արդեն կա հասցեում */
export function placeLine(district?: string | null, address?: string | null, sep = ', '): string {
  if (district && address && address.includes(district)) return address;
  return [district, address].filter(Boolean).join(sep);
}
