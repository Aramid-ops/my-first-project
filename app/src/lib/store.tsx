// Հավելվածի վիճակը՝ Supabase-ի հետ։
// Ամեն օգտատեր բազայից ստանում է միայն իրեն թույլատրվածը (RLS)։
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { nextDeliveryDate, toISODate } from './rules';
import { supabase } from './supabase';
import type { Employee, EmployeeRole, Firm, Line, Order, OrderStatus, Product, Shop, ShopFirmLink, Team, Unit, Weekday } from './types';

export type Session =
  | { kind: 'shop'; shopId: string }
  | { kind: 'employee'; employeeId: string; role: EmployeeRole }
  | { kind: 'none' } // մուտք է գործել, բայց ոչ մի դերի կցված չէ
  | null;

interface Store {
  ready: boolean;
  session: Session;
  userEmail?: string;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;

  firms: Firm[];
  employees: Employee[];
  shops: Shop[];
  links: ShopFirmLink[];
  products: Product[];
  orders: Order[];
  teams: Team[];
  lines: Line[];
  reload: () => Promise<void>;

  /** Փոխանցման թեկնածուներ. իմ խմբերի անդամները (ներքին աշխատողներ և վարորդներ), առաջարկվողները՝ առաջինը */
  forwardCandidates: (order: Order) => { employee: Employee; suggested: boolean }[];
  setLinkLine: (shopId: string, firmId: string, lineId: string | null) => Promise<string | null>;
  setLinkManager: (shopId: string, firmId: string, managerId: string) => Promise<string | null>;
  setLineDriver: (lineId: string, driverId: string | null) => Promise<string | null>;
  toggleTeamMember: (teamId: string, employeeId: string) => Promise<string | null>;

  cart: Record<string, number>;
  setQty: (productId: string, qty: number) => void;
  sendCart: () => Promise<string | null>;

  accept: (orderId: string) => Promise<void>;
  forward: (orderId: string, toEmployeeId: string) => Promise<void>;
  returnOrder: (orderId: string, reason: string) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

const palette = [
  { bg: '#E2E8F4', fg: '#2C4A8A' },
  { bg: '#E3EEF0', fg: '#1D4E5A' },
  { bg: '#F3E9D8', fg: '#7A5214' },
  { bg: '#EFE3D6', fg: '#7A3E14' },
  { bg: '#E6EDE4', fg: '#2F5A2A' },
];
function colorFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapFirm = (r: any): Firm => ({
  id: r.id,
  name: r.name,
  category: r.category ?? '',
  logoUrl: r.logo_url ?? undefined,
  color: colorFor(r.id),
  baseLat: r.base_lat ?? undefined,
  baseLng: r.base_lng ?? undefined,
});
const mapEmployee = (r: any): Employee => ({
  id: r.id,
  firmId: r.firm_id,
  name: r.name,
  role: r.role,
  department: r.department ?? undefined,
  defaultForwardToId: r.default_forward_to ?? undefined,
  phone: r.phone ?? undefined,
});
const mapShop = (r: any): Shop => ({ id: r.id, name: r.name, taxId: r.tax_id, city: r.city, district: r.district ?? '', address: r.address ?? '', phone: r.phone ?? undefined, lat: r.lat ?? undefined, lng: r.lng ?? undefined });
const mapLink = (r: any): ShopFirmLink => ({ shopId: r.shop_id, firmId: r.firm_id, managerId: r.manager_id, status: r.status, deliveryDays: (r.delivery_days ?? []) as Weekday[], lineId: r.line_id ?? undefined });
const mapLine = (r: any): Line => ({ id: r.id, firmId: r.firm_id, teamId: r.team_id ?? undefined, name: r.name, deliveryDays: (r.delivery_days ?? []) as Weekday[], driverId: r.driver_id ?? undefined });
const mapProduct = (r: any): Product => ({
  id: r.id,
  sku: r.sku ?? undefined,
  firmId: r.firm_id,
  name: r.name,
  imageUrl: r.image_url ?? undefined,
  unit: r.unit as Unit,
  packNote: r.pack_note ?? undefined,
  price: Number(r.price),
  minQty: Number(r.min_qty),
  step: Number(r.step),
  weighed: r.weighed,
  inStock: r.in_stock,
});
const mapOrder = (r: any): Order => ({
  id: r.id,
  shopId: r.shop_id,
  firmId: r.firm_id,
  managerId: r.manager_id,
  assigneeId: r.assignee_id ?? r.manager_id,
  driverId: r.driver_id ?? undefined,
  status: r.status as OrderStatus,
  deliveryDate: r.delivery_date,
  createdAt: r.created_at,
  items: (r.order_items ?? []).map((i: any) => ({ productId: i.product_id, qty: Number(i.qty), actualQty: i.actual_qty == null ? undefined : Number(i.actual_qty) })),
  events: (r.order_events ?? [])
    .map((e: any) => ({ at: e.at, byName: e.actor_name, text: e.text, lat: e.lat ?? undefined, lng: e.lng ?? undefined }))
    .sort((a: any, b: any) => a.at.localeCompare(b.at)),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export function StoreProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session>(null);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [links, setLinks] = useState<ShopFirmLink[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuth(data.session);
      if (!data.session) setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setAuth(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async () => {
    if (!auth) {
      setSession(null);
      return;
    }
    const cacheKey = `snapshot:${auth.user.id}`;
    const uid = auth.user.id;
    const [tm, tmm, ln] = await Promise.all([
      supabase.from('teams').select('*'),
      supabase.from('team_members').select('*'),
      supabase.from('lines').select('*'),
    ]);
    const [f, e, s, l, p, o, me, member] = await Promise.all([
      supabase.from('firms').select('*'),
      supabase.from('employees').select('*'),
      supabase.from('shops').select('*'),
      supabase.from('shop_firm_links').select('*'),
      supabase.from('products').select('*').order('name'),
      supabase.from('orders').select('*, order_items(*), order_events(*)').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, role').eq('user_id', uid).maybeSingle(),
      supabase.from('shop_members').select('shop_id').eq('user_id', uid).maybeSingle(),
    ]);
    // Առանց ինտերնետի. պահում ենք վերջին հաջողված պատկերը և աշխատում դրանով
    if ([f, e, s, l, p, o, me, member].some((r) => r.error)) {
      const raw = await AsyncStorage.getItem(cacheKey).catch(() => null);
      if (raw) {
        const c = JSON.parse(raw);
        setFirms(c.firms);
        setEmployees(c.employees);
        setShops(c.shops);
        setLinks(c.links);
        setProducts(c.products);
        setOrders(c.orders);
        setTeams(c.teams ?? []);
        setLines(c.lines ?? []);
        setSession(c.session);
      }
      setReady(true);
      return;
    }
    const lineList = (ln.data ?? []).map(mapLine);
    const teamList: Team[] = (tm.data ?? []).map((t: { id: string; firm_id: string; name: string }) => ({
      id: t.id,
      firmId: t.firm_id,
      name: t.name,
      memberIds: (tmm.data ?? []).filter((m: { team_id: string }) => m.team_id === t.id).map((m: { employee_id: string }) => m.employee_id),
    }));
    const snap = {
      teams: teamList,
      lines: lineList,
      firms: (f.data ?? []).map(mapFirm),
      employees: (e.data ?? []).map(mapEmployee),
      shops: (s.data ?? []).map(mapShop),
      // Եթե խանութը գծի վրա է, առաքման օրերը վերցվում են գծից
      links: (l.data ?? []).map(mapLink).map((x: ShopFirmLink) => {
        const line = lineList.find((y) => y.id === x.lineId);
        return line ? { ...x, deliveryDays: line.deliveryDays } : x;
      }),
      products: (p.data ?? []).map(mapProduct),
      orders: (o.data ?? []).map(mapOrder),
      session: (member.data
        ? { kind: 'shop', shopId: member.data.shop_id }
        : me.data
          ? { kind: 'employee', employeeId: me.data.id, role: me.data.role }
          : { kind: 'none' }) as Session,
    };
    AsyncStorage.setItem(cacheKey, JSON.stringify(snap)).catch(() => {});
    setTeams(snap.teams);
    setLines(snap.lines);
    setFirms(snap.firms);
    setEmployees((e.data ?? []).map(mapEmployee));
    setShops((s.data ?? []).map(mapShop));
    setLinks((l.data ?? []).map(mapLink));
    setProducts((p.data ?? []).map(mapProduct));
    setOrders((o.data ?? []).map(mapOrder));
    setSession(snap.session);
    setReady(true);
  }, [auth]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Ակնթարթային թարմացում. նոր պատվեր կամ փոփոխություն → վերբեռնել
  useEffect(() => {
    if (!auth) return;
    const ch = supabase
      .channel('orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [auth, reload]);

  const value = useMemo<Store>(() => {
    // Անունը և ժամը լրացնում է բազան (order_events_fill)
    const addEvent = (orderId: string, text: string) => supabase.from('order_events').insert({ order_id: orderId, actor_name: '', text });

    return {
      ready,
      session,
      userEmail: auth?.user.email ?? undefined,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? error.message : null;
      },
      signOut: async () => {
        setCart({});
        setSession(null);
        await supabase.auth.signOut();
      },
      firms,
      employees,
      shops,
      links,
      products,
      orders,
      teams,
      lines,
      reload,
      forwardCandidates: (order) => {
        if (session?.kind !== 'employee') return [];
        const me = employees.find((x) => x.id === session.employeeId);
        if (!me) return [];
        const myTeams = teams.filter((t) => t.memberIds.includes(me.id));
        const ids = new Set(myTeams.flatMap((t) => t.memberIds));
        const link = links.find((x) => x.shopId === order.shopId && x.firmId === order.firmId);
        const line = lines.find((x) => x.id === link?.lineId);
        const suggestedIds = new Set([line?.driverId, me.defaultForwardToId].filter(Boolean) as string[]);
        return employees
          .filter((x) => x.id !== me.id && x.firmId === me.firmId && (x.role === 'staff' || x.role === 'driver') && (ids.has(x.id) || suggestedIds.has(x.id)))
          .map((x) => ({ employee: x, suggested: suggestedIds.has(x.id) }))
          .sort((a, b) => Number(b.suggested) - Number(a.suggested));
      },
      setLinkLine: async (shopId, firmId, lineId) => {
        const { error } = await supabase.from('shop_firm_links').update({ line_id: lineId }).eq('shop_id', shopId).eq('firm_id', firmId);
        await reload();
        return error?.message ?? null;
      },
      setLinkManager: async (shopId, firmId, managerId) => {
        const { error } = await supabase.from('shop_firm_links').update({ manager_id: managerId }).eq('shop_id', shopId).eq('firm_id', firmId);
        await reload();
        return error?.message ?? null;
      },
      setLineDriver: async (lineId, driverId) => {
        const { error } = await supabase.from('lines').update({ driver_id: driverId }).eq('id', lineId);
        await reload();
        return error?.message ?? null;
      },
      toggleTeamMember: async (teamId, employeeId) => {
        const t = teams.find((x) => x.id === teamId);
        const { error } = t?.memberIds.includes(employeeId)
          ? await supabase.from('team_members').delete().eq('team_id', teamId).eq('employee_id', employeeId)
          : await supabase.from('team_members').insert({ team_id: teamId, employee_id: employeeId });
        await reload();
        return error?.message ?? null;
      },
      cart,
      setQty: (productId, qty) =>
        setCart((c) => {
          const next = { ...c };
          if (qty <= 0) delete next[productId];
          else next[productId] = qty;
          return next;
        }),
      sendCart: async () => {
        if (session?.kind !== 'shop') return 'Մուտք գործեք որպես խանութ';
        const byFirm = new Map<string, { p: Product; qty: number }[]>();
        for (const [pid, qty] of Object.entries(cart)) {
          const p = products.find((x) => x.id === pid);
          if (p) byFirm.set(p.firmId, [...(byFirm.get(p.firmId) ?? []), { p, qty }]);
        }
        // Ամեն մատակարարի համար՝ մեկ ատոմային գործողություն (place_order).
        // Գինը, քանակի կանոնները և մենեջերը ստուգում/լրացնում է բազան։
        for (const [firmId, items] of byFirm) {
          const link = links.find((l) => l.shopId === session.shopId && l.firmId === firmId);
          if (!link) continue;
          const { error } = await supabase.rpc('place_order', {
            p_shop: session.shopId,
            p_firm: firmId,
            p_delivery: toISODate(nextDeliveryDate(link.deliveryDays)),
            p_items: items.map(({ p, qty }) => ({ product_id: p.id, qty })),
          });
          if (error) {
            await reload();
            return error.message;
          }
          // Հաջողված մասը հանում ենք զամբյուղից, որ կրկնակի չուղարկվի
          setCart((c) => {
            const next = { ...c };
            for (const { p } of items) delete next[p.id];
            return next;
          });
        }
        setCart({});
        await reload();
        return null;
      },
      accept: async (orderId) => {
        await supabase.from('orders').update({ status: 'accepted' }).eq('id', orderId);
        await addEvent(orderId, 'Ընդունեց');
        await reload();
      },
      forward: async (orderId, to) => {
        const target = employees.find((x) => x.id === to);
        await supabase
          .from('orders')
          .update(target?.role === 'driver' ? { status: 'preparing', assignee_id: to, driver_id: to } : { status: 'preparing', assignee_id: to })
          .eq('id', orderId);
        await addEvent(orderId, `Փոխանցեց → ${employees.find((x) => x.id === to)?.name ?? ''}`);
        await reload();
      },
      returnOrder: async (orderId, reason) => {
        await supabase.from('orders').update({ status: 'returned' }).eq('id', orderId);
        await addEvent(orderId, `Վերադարձրեց. ${reason}`);
        await reload();
      },
    };
  }, [ready, session, auth, firms, employees, shops, links, products, orders, teams, lines, cart, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
