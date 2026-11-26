// Հավելվածի վիճակը՝ Supabase-ի հետ։
// Ամեն օգտատեր բազայից ստանում է միայն իրեն թույլատրվածը (RLS)։
import type { Session as AuthSession } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { nextDeliveryDate, toISODate } from './rules';
import { supabase } from './supabase';
import type { Employee, Firm, Order, OrderStatus, Product, Shop, ShopFirmLink, Unit, Weekday } from './types';

export type Session =
  | { kind: 'shop'; shopId: string }
  | { kind: 'employee'; employeeId: string }
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
  reload: () => Promise<void>;

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
const mapFirm = (r: any): Firm => ({ id: r.id, name: r.name, category: r.category ?? '', logoUrl: r.logo_url ?? undefined, color: colorFor(r.id) });
const mapEmployee = (r: any): Employee => ({
  id: r.id,
  firmId: r.firm_id,
  name: r.name,
  role: r.role,
  department: r.department ?? undefined,
  defaultForwardToId: r.default_forward_to ?? undefined,
  phone: r.phone ?? undefined,
});
const mapShop = (r: any): Shop => ({ id: r.id, name: r.name, taxId: r.tax_id, city: r.city, district: r.district ?? '', address: r.address ?? '', phone: r.phone ?? undefined });
const mapLink = (r: any): ShopFirmLink => ({ shopId: r.shop_id, firmId: r.firm_id, managerId: r.manager_id, status: r.status, deliveryDays: (r.delivery_days ?? []) as Weekday[] });
const mapProduct = (r: any): Product => ({
  id: r.id,
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
  status: r.status as OrderStatus,
  deliveryDate: r.delivery_date,
  createdAt: r.created_at,
  items: (r.order_items ?? []).map((i: any) => ({ productId: i.product_id, qty: Number(i.qty), actualQty: i.actual_qty == null ? undefined : Number(i.actual_qty) })),
  events: (r.order_events ?? [])
    .map((e: any) => ({ at: e.at, byName: e.actor_name, text: e.text }))
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
    const uid = auth.user.id;
    const [f, e, s, l, p, o, me, member] = await Promise.all([
      supabase.from('firms').select('*'),
      supabase.from('employees').select('*'),
      supabase.from('shops').select('*'),
      supabase.from('shop_firm_links').select('*'),
      supabase.from('products').select('*').order('name'),
      supabase.from('orders').select('*, order_items(*), order_events(*)').order('created_at', { ascending: false }),
      supabase.from('employees').select('id').eq('user_id', uid).maybeSingle(),
      supabase.from('shop_members').select('shop_id').eq('user_id', uid).maybeSingle(),
    ]);
    setFirms((f.data ?? []).map(mapFirm));
    setEmployees((e.data ?? []).map(mapEmployee));
    setShops((s.data ?? []).map(mapShop));
    setLinks((l.data ?? []).map(mapLink));
    setProducts((p.data ?? []).map(mapProduct));
    setOrders((o.data ?? []).map(mapOrder));
    if (member.data) setSession({ kind: 'shop', shopId: member.data.shop_id });
    else if (me.data) setSession({ kind: 'employee', employeeId: me.data.id });
    else setSession({ kind: 'none' });
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
    const actorName = () => {
      if (session?.kind === 'employee') return employees.find((x) => x.id === session.employeeId)?.name ?? '';
      if (session?.kind === 'shop') return shops.find((x) => x.id === session.shopId)?.name ?? '';
      return auth?.user.email ?? '';
    };
    const addEvent = (orderId: string, text: string) =>
      supabase.from('order_events').insert({ order_id: orderId, actor_user: auth?.user.id, actor_name: actorName(), text });

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
      reload,
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
        for (const [firmId, items] of byFirm) {
          const link = links.find((l) => l.shopId === session.shopId && l.firmId === firmId);
          if (!link) continue;
          const { data: order, error } = await supabase
            .from('orders')
            .insert({
              shop_id: session.shopId,
              firm_id: firmId,
              manager_id: link.managerId,
              assignee_id: link.managerId,
              status: 'sent',
              delivery_date: toISODate(nextDeliveryDate(link.deliveryDays)),
            })
            .select('id')
            .single();
          if (error || !order) return error?.message ?? 'Չհաջողվեց ուղարկել';
          const r = await supabase.from('order_items').insert(items.map(({ p, qty }) => ({ order_id: order.id, product_id: p.id, qty, price: p.price })));
          if (r.error) return r.error.message;
          await addEvent(order.id, 'Ուղարկեց պատվերը');
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
        await supabase.from('orders').update({ status: 'preparing', assignee_id: to }).eq('id', orderId);
        await addEvent(orderId, `Փոխանցեց → ${employees.find((x) => x.id === to)?.name ?? ''}`);
        await reload();
      },
      returnOrder: async (orderId, reason) => {
        await supabase.from('orders').update({ status: 'returned' }).eq('id', orderId);
        await addEvent(orderId, `Վերադարձրեց. ${reason}`);
        await reload();
      },
    };
  }, [ready, session, auth, firms, employees, shops, links, products, orders, cart, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
