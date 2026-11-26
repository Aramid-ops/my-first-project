// Կանգառների ավտոմատ հերթականություն. ֆիրմայի բազայից սկսած՝ ամեն անգամ ամենամոտ հաջորդ խանութը
// («մոտակա հարևան» մեթոդ)։ Կոորդինատ չունեցող խանութները՝ վերջում։
import { haversineKm, type Point } from './geo';

export function orderByNearest<T>(items: T[], pointOf: (x: T) => Point | null, start: Point | null): T[] {
  const withP = items.map((x) => ({ x, p: pointOf(x) }));
  const located = withP.filter((w): w is { x: T; p: Point } => !!w.p);
  const rest = withP.filter((w) => !w.p).map((w) => w.x);
  if (!start || located.length === 0) return [...located.map((w) => w.x), ...rest];
  const out: T[] = [];
  let cur = start;
  const left = [...located];
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (haversineKm(cur, left[i].p) < haversineKm(cur, left[best].p)) best = i;
    const [next] = left.splice(best, 1);
    out.push(next.x);
    cur = next.p;
  }
  return [...out, ...rest];
}
