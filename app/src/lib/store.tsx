// Հավելվածի վիճակը՝ Supabase-ի հետ։
// Ամեն օգտատեր բազայից ստանում է միայն իրեն թույլատրվածը (RLS)։
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { registerPush } from './push';
import { nextDeliveryDate, toISODate } from './rules';
import { supabase } from './supabase';
import type { Debt, DriverProfile, Employee, SavedList, EmployeeRole, Firm, Issue, IssueKind, Line, Order, OrderStatus, Payment, Product, Shop, ShopFirmLink, Team, Unit, Weekday } from './types';

export type Session =
  | { kind: 'shop'; shopId: string }
  | { kind: 'employee'; employeeId: string; role: EmployeeRole }
  | { kind: 'driverSelf' } // անկախ վարորդ (ֆիրմայի աշխատող չէ)
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
  issues: Issue[];
  debts: Debt[];
  payments: Payment[];
  savedLists: SavedList[];
  driverProfile: DriverProfile | null;
  acceptInvite: (code: string) => Promise<{ firm?: string; error?: string }>;
  /** Խանութի իրական գինը (զեղչով / անհատական) */
  priceOf: (p: Product) => number;
  reload: () => Promise<void>;
  saveProduct: (p: Partial<Product> & { firmId: string }) => Promise<string | null>;
  inviteEmployee: (name: string, role: EmployeeRole, department: string, phone: string) => Promise<{ code?: string; error?: string }>;
  setLinkTerms: (shopId: string, firmId: string, discountPct: number, creditLimit: number | null) => Promise<string | null>;
  updateFirm: (patch: Record<string, unknown>) => Promise<string | null>;
  saveList: (name: string) => Promise<string | null>;
  applyList: (list: SavedList) => number;
  deleteList: (id: string) => Promise<void>;

  requestJoin: (firmId: string) => Promise<string | null>;
  acceptRequest: (shopId: string, lineId: string | null) => Promise<string | null>;
  updateShop: (patch: Record<string, string>) => Promise<string | null>;
  reportIssue: (orderId: string, productId: string, kind: IssueKind, qty: number | null, note: string, photoUrl?: string) => Promise<string | null>;
  markPaid: (firmId: string, amount: number, note: string) => Promise<string | null>;
  confirmPayment: (paymentId: string) => Promise<string | null>;
  setInvoice: (orderId: string, num: string) => Promise<string | null>;
  /** Մենեջերը ինքն է առաքում (երբ ֆիրման վարորդներ չունի հավելվածում) */
  setStatus: (orderId: string, status: 'on_the_way' | 'delivered') => Promise<string | null>;
  placeOrderForShop: (shopId: string, items: { productId: string; qty: number }[]) => Promise<string | null>;
  repeatOrder: (order: Order) => number;
  /** Առաքման հաջորդ օրը՝ գծի օրերով և վերջնաժամով */
  deliveryDate: (link: ShopFirmLink) => Date;
  cutoffOf: (link: ShopFirmLink) => string | undefined;

  /** Փոխանցման թեկնածուներ. իմ խմբերի անդամները (ներքին աշխատողներ և վարորդներ), առաջարկվողները՝ առաջինը */
  forwardCandidates: (order: Order) => { employee: Employee; suggested: boolean }[];
  setLinkLine: (shopId: string, firmId: string, lineId: string | null) => Promise<string | null>;
  setLinkManager: (shopId: string, firmId: string, managerId: string) => Promise<string | null>;
  setLineDriver: (lineId: string, driverId: string | null) => Promise<string | null>;
  setLineCutoff: (lineId: string, cutoff: string | null) => Promise<string | null>;
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
  featuredUntil: r.featured_until ?? undefined,
  minOrderAmount: r.min_order_amount == null ? undefined : Number(r.min_order_amount),
  status: r.status ?? 'active',
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
const mapShop = (r: any): Shop => ({
  id: r.id,
  name: r.name,
  taxId: r.tax_id,
  city: r.city,
  district: r.district ?? '',
  address: r.address ?? '',
  phone: r.phone ?? undefined,
  lat: r.lat ?? undefined,
  lng: r.lng ?? undefined,
  legalName: r.legal_name ?? undefined,
  email: r.email ?? undefined,
  contactPerson: r.contact_person ?? undefined,
});
const mapLink = (r: any): ShopFirmLink => ({ shopId: r.shop_id, firmId: r.firm_id, managerId: r.manager_id, status: r.status, deliveryDays: (r.delivery_days ?? []) as Weekday[], lineId: r.line_id ?? undefined, discountPct: Number(r.discount_pct ?? 0), creditLimit: r.credit_limit == null ? undefined : Number(r.credit_limit) });
const mapLine = (r: any): Line => ({ id: r.id, firmId: r.firm_id, teamId: r.team_id ?? undefined, name: r.name, deliveryDays: (r.delivery_days ?? []) as Weekday[], driverId: r.driver_id ?? undefined, orderCutoff: r.order_cutoff ? String(r.order_cutoff).slice(0, 5) : undefined });
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
  invoiceNumber: r.invoice_number ?? undefined,
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
  const [issues, setIssues] = useState<Issue[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [savedLists, setSavedLists] = useState<SavedList[]>([]);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
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
    const [tm, tmm, ln, iss, dbt, pay] = await Promise.all([
      supabase.from('teams').select('*'),
      supabase.from('team_members').select('*'),
      supabase.from('lines').select('*'),
      supabase.from('order_issues').select('*').order('created_at', { ascending: false }),
      supabase.rpc('debts'),
      supabase.from('payments').select('*').order('marked_paid_by_shop_at', { ascending: false }),
    ]);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    setIssues((iss.data ?? []).map((r: any) => ({ id: r.id, orderId: r.order_id, productId: r.product_id ?? undefined, kind: r.kind, qty: r.qty == null ? undefined : Number(r.qty), note: r.note ?? undefined, photoUrl: r.photo_url ?? undefined, createdAt: r.created_at })));
    setDebts((dbt.data ?? []).map((r: any) => ({ shopId: r.shop_id, firmId: r.firm_id, delivered: Number(r.delivered), paid: Number(r.paid), pending: Number(r.pending), debt: Number(r.debt) })));
    setPayments((pay.data ?? []).map((r: any) => ({ id: r.id, shopId: r.shop_id, firmId: r.firm_id, amount: Number(r.amount), confirmed: !!r.confirmed_at, markedAt: r.marked_paid_by_shop_at ?? undefined, note: r.note ?? undefined })));
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const dp = await supabase.from('driver_profiles').select('*').eq('user_id', uid).maybeSingle();
    setDriverProfile(
      dp.data
        ? {
            name: dp.data.name,
            phone: dp.data.phone ?? undefined,
            address: dp.data.address ?? undefined,
            licenseCategories: dp.data.license_categories ?? [],
            vehicleType: dp.data.vehicle_type ?? undefined,
            vehicleModel: dp.data.vehicle_model ?? undefined,
            plate: dp.data.plate ?? undefined,
            capacityKg: dp.data.capacity_kg == null ? undefined : Number(dp.data.capacity_kg),
            refrigerated: !!dp.data.refrigerated,
          }
        : null,
    );
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
          : dp.data
            ? { kind: 'driverSelf' }
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
    if (snap.session?.kind === 'shop') {
      const firmIds = snap.links.filter((x: ShopFirmLink) => x.status === 'active').map((x: ShopFirmLink) => x.firmId);
      const [pr, sl] = await Promise.all([
        Promise.all(firmIds.map((fid: string) => supabase.rpc('my_prices', { p_firm: fid }))),
        supabase.from('saved_lists').select('*').order('created_at', { ascending: false }),
      ]);
      const map: Record<string, number> = {};
      for (const r of pr) for (const row of (r.data ?? []) as { product_id: string; price: number }[]) map[row.product_id] = Number(row.price);
      setPrices(map);
      setSavedLists(((sl.data ?? []) as { id: string; name: string; items: { product_id: string; qty: number }[] }[]).map((x) => ({ id: x.id, name: x.name, items: x.items.map((i) => ({ productId: i.product_id, qty: Number(i.qty) })) })));
    }
    setSession(snap.session);
    setReady(true);
  }, [auth]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (auth) registerPush(auth.user.id);
  }, [auth]);

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
      issues,
      debts,
      payments,
      savedLists,
      driverProfile,
      acceptInvite: async (code) => {
        const { data, error } = await supabase.rpc('accept_invite', { p_code: code });
        await reload();
        return error ? { error: error.message } : { firm: data as string };
      },
      priceOf: (p) => prices[p.id] ?? p.price,
      reload,
      saveProduct: async (p) => {
        const row = {
          firm_id: p.firmId,
          name: p.name,
          unit: p.unit,
          pack_note: p.packNote || null,
          price: p.price,
          min_qty: p.minQty,
          step: p.step,
          weighed: !!p.weighed,
          in_stock: p.inStock ?? true,
          image_url: p.imageUrl || null,
        };
        const { error } = p.id ? await supabase.from('products').update(row).eq('id', p.id) : await supabase.from('products').insert(row);
        await reload();
        return error?.message ?? null;
      },
      inviteEmployee: async (name, role, department, phone) => {
        const { data, error } = await supabase.rpc('invite_employee', { p_name: name, p_role: role, p_department: department, p_phone: phone });
        await reload();
        return error ? { error: error.message } : { code: data as string };
      },
      setLinkTerms: async (shopId, firmId, discountPct, creditLimit) => {
        const { error } = await supabase.from('shop_firm_links').update({ discount_pct: discountPct, credit_limit: creditLimit }).eq('shop_id', shopId).eq('firm_id', firmId);
        await reload();
        return error?.message ?? null;
      },
      updateFirm: async (patch) => {
        if (session?.kind !== 'employee') return 'Միայն ղեկավարը';
        const me = employees.find((x) => x.id === session.employeeId);
        const { error } = await supabase.from('firms').update(patch).eq('id', me!.firmId);
        await reload();
        return error?.message ?? null;
      },
      saveList: async (name) => {
        if (session?.kind !== 'shop') return 'Մուտք գործեք որպես խանութ';
        const items = Object.entries(cart).map(([product_id, qty]) => ({ product_id, qty }));
        const { error } = await supabase.from('saved_lists').insert({ shop_id: session.shopId, name, items });
        await reload();
        return error?.message ?? null;
      },
      applyList: (list) => {
        let n = 0;
        setCart((c) => {
          const next = { ...c };
          for (const it of list.items) {
            const p = products.find((x) => x.id === it.productId);
            if (p?.inStock) {
              next[p.id] = it.qty;
              n++;
            }
          }
          return next;
        });
        return n;
      },
      deleteList: async (id) => {
        await supabase.from('saved_lists').delete().eq('id', id);
        await reload();
      },
      requestJoin: async (firmId) => {
        const { error } = await supabase.rpc('request_join', { p_firm: firmId });
        await reload();
        return error?.message ?? null;
      },
      acceptRequest: async (shopId, lineId) => {
        if (session?.kind !== 'employee') return 'Մուտք գործեք որպես աշխատող';
        const me = employees.find((x) => x.id === session.employeeId);
        const link = links.find((l) => l.shopId === shopId && l.firmId === me?.firmId);
        const managerId = me?.role === 'manager' ? me.id : link?.managerId;
        if (!managerId) return 'Ընտրեք մենեջեր';
        const { error } = await supabase
          .from('shop_firm_links')
          .update({ status: 'active', manager_id: managerId, line_id: lineId })
          .eq('shop_id', shopId)
          .eq('firm_id', me!.firmId);
        await reload();
        return error?.message ?? null;
      },
      updateShop: async (patch) => {
        if (session?.kind !== 'shop') return 'Մուտք գործեք որպես խանութ';
        const { error } = await supabase.from('shops').update(patch).eq('id', session.shopId);
        await reload();
        return error?.message ?? null;
      },
      reportIssue: async (orderId, productId, kind, qty, note, photoUrl) => {
        const { error } = await supabase.from('order_issues').insert({ order_id: orderId, product_id: productId, kind, qty, note: note || null, photo_url: photoUrl ?? null });
        await reload();
        return error?.message ?? null;
      },
      markPaid: async (firmId, amount, note) => {
        if (session?.kind !== 'shop') return 'Մուտք գործեք որպես խանութ';
        const { error } = await supabase.from('payments').insert({ shop_id: session.shopId, firm_id: firmId, amount, note: note || null });
        await reload();
        return error?.message ?? null;
      },
      confirmPayment: async (paymentId) => {
        const { error } = await supabase.from('payments').update({ confirmed_at: new Date().toISOString() }).eq('id', paymentId);
        await reload();
        return error?.message ?? null;
      },
      setStatus: async (orderId, status) => {
        const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
        if (!error) await addEvent(orderId, status === 'delivered' ? 'Առաքեց' : 'Մեկնեց');
        await reload();
        return error?.message ?? null;
      },
      setInvoice: async (orderId, num) => {
        const { error } = await supabase.from('orders').update({ invoice_number: num || null }).eq('id', orderId);
        if (!error) await addEvent(orderId, `Ֆակտուրա № ${num}`);
        await reload();
        return error?.message ?? null;
      },
      placeOrderForShop: async (shopId, items) => {
        if (session?.kind !== 'employee') return 'Մուտք գործեք որպես մենեջեր';
        const me = employees.find((x) => x.id === session.employeeId);
        const link = links.find((l) => l.shopId === shopId && l.firmId === me?.firmId);
        const line = lines.find((x) => x.id === link?.lineId);
        const { error } = await supabase.rpc('place_order_for_shop', {
          p_shop: shopId,
          p_firm: me!.firmId,
          p_delivery: toISODate(nextDeliveryDate(link?.deliveryDays ?? [], new Date(), line?.orderCutoff)),
          p_items: items.map((x) => ({ product_id: x.productId, qty: x.qty })),
        });
        await reload();
        return error?.message ?? null;
      },
      deliveryDate: (link) => nextDeliveryDate(link.deliveryDays, new Date(), lines.find((x) => x.id === link.lineId)?.orderCutoff),
      cutoffOf: (link) => lines.find((x) => x.id === link.lineId)?.orderCutoff,
      repeatOrder: (order) => {
        let n = 0;
        setCart((c) => {
          const next = { ...c };
          for (const it of order.items) {
            const p = products.find((x) => x.id === it.productId);
            if (p?.inStock) {
              next[p.id] = it.qty;
              n++;
            }
          }
          return next;
        });
        return n;
      },
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
      setLineCutoff: async (lineId, cutoff) => {
        const { error } = await supabase.from('lines').update({ order_cutoff: cutoff }).eq('id', lineId);
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
            p_delivery: toISODate(nextDeliveryDate(link.deliveryDays, new Date(), lines.find((x) => x.id === link.lineId)?.orderCutoff)),
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
  }, [ready, session, auth, firms, employees, shops, links, products, orders, teams, lines, issues, debts, payments, savedLists, driverProfile, prices, cart, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
