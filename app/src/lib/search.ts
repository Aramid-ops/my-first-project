// Նույն «կմախքը», ինչ բազայում (supabase/migrations/0006_search_and_sku.sql → search_skeleton).
// Հայերեն / ռուսերեն / լատինատառ → մեկ պարզեցված լատինատառ ձև։
// Եթե փոխում ես այստեղ, փոխիր նաև SQL-ում (և հակառակը)։

const pairs: [string, string][] = [
  // հայերեն երկտառեր
  ['ու', 'u'],
  ['և', 'ev'],
];

const armSingle: Record<string, string> = {
  ա: 'a', բ: 'b', գ: 'g', դ: 'd', ե: 'e', զ: 'z', է: 'e', ը: 'e', թ: 't', ի: 'i', լ: 'l', կ: 'k', հ: 'h',
  մ: 'm', յ: 'y', ն: 'n', ո: 'o', պ: 'p', ռ: 'r', ս: 's', վ: 'v', տ: 't', ր: 'r', փ: 'p', ք: 'k', օ: 'o', ֆ: 'f',
  ժ: 'zh', խ: 'kh', ծ: 'ts', ձ: 'dz', ղ: 'gh', ճ: 'ch', շ: 'sh', չ: 'ch', ջ: 'j', ց: 'ts',
};

const rus: Record<string, string> = {
  ж: 'zh', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ю: 'yu', я: 'ya', ё: 'e',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', ы: 'y', э: 'e', ъ: '', ь: '',
};

const fold: [string, string][] = [
  ['zh', 'j'],
  ['kh', 'x'],
  ['gh', 'x'],
  ['ch', 'c'],
  ['sh', 's'],
  ['ts', 'c'],
  ['dz', 'z'],
  ['ou', 'u'],
];

export function searchSkeleton(input: string): string {
  let s = (input ?? '').toLowerCase();
  for (const [a, b] of pairs) s = s.split(a).join(b);
  s = Array.from(s)
    .map((ch) => armSingle[ch] ?? ch)
    .join('');
  s = Array.from(s)
    .map((ch) => (ch in rus ? rus[ch] : ch))
    .join('');
  for (const [a, b] of fold) s = s.split(a).join(b);
  s = s.replace(/q/g, 'k').replace(/w/g, 'v').replace(/y/g, 'i').replace(/h/g, '');
  return s.replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Համընկնո՞ւմ է արդյոք տեքստը որոնման հետ (սկզբից կամ ցանկացած բառի մեջ) */
export function matches(text: string, query: string): boolean {
  const q = searchSkeleton(query);
  if (!q) return true;
  return searchSkeleton(text).includes(q);
}

/** Համընկնում բառի սկզբից (անունների համար՝ «աթ» → «Աթենք», բայց ոչ «Կաթնաշխարհ») */
export function startsWithWord(text: string, query: string): boolean {
  const q = searchSkeleton(query);
  if (!q) return true;
  const t = searchSkeleton(text);
  return t.startsWith(q) || t.includes(` ${q}`);
}
