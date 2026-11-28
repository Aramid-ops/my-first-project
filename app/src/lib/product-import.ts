// Ապրանքների ներմուծում Excel-ից (.xlsx) կամ CSV-ից. նախադիտում (նոր / թարմացվող / սխալներ) → հաստատում
import { categories } from './categories';
import { units, type Product, type Unit } from './types';

export type ImportRow = { line: number; name: string; unit: Unit; price: number; minQty: number; step: number; packNote: string; category?: string; existing?: Product };
export type ImportPreview = { rows: ImportRow[]; added: ImportRow[]; updated: ImportRow[]; priceChanges: { name: string; from: number; to: number }[]; errors: string[]; newCategories: string[] };

// Վերնագրեր՝ հայերեն կամ անգլերեն
const cols: Record<string, string[]> = {
  name: ['անվանում', 'name', 'ապրանք'],
  unit: ['միավոր', 'unit'],
  price: ['գին', 'price'],
  minQty: ['նվազագույն', 'min_qty', 'min'],
  step: ['քայլ', 'step'],
  packNote: ['փաթեթավորում', 'pack_note', 'pack'],
  category: ['կատեգորիա', 'category'],
};

/** CSV տեքստ → տողեր (; կամ , բաժանիչով) */
export function csvRows(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  return lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
}

/** Գրված կատեգորիա → ստանդարտը (մեծատառ/փոքրատառ անկախ) կամ նոր՝ ինչպես գրված է. դատարկ՝ ավտոմատ */
function categoryOf(raw: string, known: string[], added: string[]) {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  const key = (c: string) => c.toLowerCase().replace(/\s+/g, ' ').trim().replace(/(ներ|եր)$/, '');
  const hit = [...known, ...added].find((c) => key(c) === key(t)); // «պահածո» = «Պահածոներ»
  if (hit) return hit;
  const c = t[0].toUpperCase() + t.slice(1);
  added.push(c);
  return c;
}

const num = (v: unknown) => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));

export function buildPreview(table: unknown[][], existing: Product[]): ImportPreview {
  const head = (table[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase());
  const idx = (k: string) => head.findIndex((h) => cols[k].includes(h));
  const at = (r: unknown[], k: string) => (idx(k) >= 0 ? String(r[idx(k)] ?? '').trim() : '');
  const out: ImportPreview = { rows: [], added: [], updated: [], priceChanges: [], errors: [], newCategories: [] };
  const known = [...categories, ...existing.map((p) => p.category).filter((c): c is string => !!c)];
  if (idx('name') < 0 || idx('price') < 0) {
    out.errors.push('Առաջին տողում պետք է լինեն «անվանում» և «գին» սյուները (ներբեռնեք նմուշը)');
    return out;
  }
  const seen = new Set<string>();
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = at(r, 'name');
    if (!name) return;
    if (seen.has(name.toLowerCase())) return void out.errors.push(`Տող ${line} («${name}»)՝ նույն անունը արդեն կա ֆայլում`);
    seen.add(name.toLowerCase());
    const price = num(at(r, 'price'));
    const unitRaw = at(r, 'unit') || 'հատ';
    if (!(price > 0)) return void out.errors.push(`Տող ${line} («${name}»)՝ գին չկա կամ սխալ է`);
    if (!units.includes(unitRaw as Unit)) return void out.errors.push(`Տող ${line} («${name}»)՝ «${unitRaw}» միավոր չկա (${units.join(', ')})`);
    const minQty = num(at(r, 'minQty')) || 1;
    const row: ImportRow = {
      line, name, unit: unitRaw as Unit, price, minQty, step: num(at(r, 'step')) || minQty,
      packNote: at(r, 'packNote'), category: categoryOf(at(r, 'category'), known, out.newCategories),
      existing: existing.find((p) => p.name.trim().toLowerCase() === name.toLowerCase()),
    };
    out.rows.push(row);
    if (row.existing) {
      out.updated.push(row);
      if (row.existing.price !== price) out.priceChanges.push({ name, from: row.existing.price, to: price });
    } else out.added.push(row);
  });
  return out;
}
