// Հավելվածի վիճակը։ Առայժմ հիշողության մեջ (demo)՝ որ հնարավոր լինի փորձել
// ամբողջ ճանապարհը (խանութ → մենեջեր → ներս) առանց սերվերի։
// Հաջորդ քայլում նույն գործողությունները կկատարվեն Supabase-ի միջոցով։
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import * as demo from './demo-data';
import { nextDeliveryDate, toISODate } from './rules';
import type { Employee, Firm, Order, Product, Shop, ShopFirmLink } from './types';

export type Session =
  | { kind: 'shop'; shopId: string }
  | { kind: 'employee'; employeeId: string }
  | null;

interface Store {
  session: Session;
  signIn: (s: Session) => void;
  signOut: () => void;

  firms: Firm[];
  employees: Employee[];
  shops: Shop[];
  links: ShopFirmLink[];
  products: Product[];
  orders: Order[];

  /** productId → քանակ */
  cart: Record<string, number>;
  setQty: (productId: string, qty: number) => void;
  /** Զամբյուղը բաժանում է ըստ ֆիրմայի և ամեն մասը ուղարկում խանութի մենեջերին */
  sendCart: () => Order[];

  accept: (orderId: string) => void;
  forward: (orderId: string, toEmployeeId: string) => void;
  returnOrder: (orderId: string, reason: string) => void;
}

const Ctx = createContext<Store | null>(null);

let seq = 1000;
const now = () => new Date().toISOString();

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<Order[]>([]);

  const value = useMemo<Store>(() => {
    const empName = (id: string) => demo.employees.find((e) => e.id === id)?.name ?? '';
    const actorName = () => {
      if (session?.kind === 'employee') return empName(session.employeeId);
      if (session?.kind === 'shop') return demo.shops.find((s) => s.id === session.shopId)?.name ?? '';
      return '';
    };
    const update = (orderId: string, fn: (o: Order) => Order) =>
      setOrders((list) => list.map((o) => (o.id === orderId ? fn(o) : o)));

    return {
      session,
      signIn: setSession,
      signOut: () => {
        setSession(null);
        setCart({});
      },
      firms: demo.firms,
      employees: demo.employees,
      shops: demo.shops,
      links: demo.links,
      products: demo.products,
      orders,
      cart,
      setQty: (productId, qty) =>
        setCart((c) => {
          const next = { ...c };
          if (qty <= 0) delete next[productId];
          else next[productId] = qty;
          return next;
        }),
      sendCart: () => {
        if (session?.kind !== 'shop') return [];
        const shopId = session.shopId;
        const byFirm = new Map<string, Order['items']>();
        for (const [productId, qty] of Object.entries(cart)) {
          const p = demo.products.find((x) => x.id === productId);
          if (!p) continue;
          byFirm.set(p.firmId, [...(byFirm.get(p.firmId) ?? []), { productId, qty }]);
        }
        const created: Order[] = [];
        for (const [firmId, items] of byFirm) {
          const link = demo.links.find((l) => l.shopId === shopId && l.firmId === firmId);
          if (!link) continue;
          created.push({
            id: `o-${++seq}`,
            shopId,
            firmId,
            managerId: link.managerId,
            assigneeId: link.managerId,
            status: 'sent',
            deliveryDate: toISODate(nextDeliveryDate(link.deliveryDays)),
            items,
            createdAt: now(),
            events: [{ at: now(), byName: actorName(), text: 'Ուղարկեց պատվերը' }],
          });
        }
        setOrders((list) => [...created, ...list]);
        setCart({});
        return created;
      },
      accept: (orderId) =>
        update(orderId, (o) => ({
          ...o,
          status: 'accepted',
          events: [...o.events, { at: now(), byName: actorName(), text: 'Ընդունեց' }],
        })),
      forward: (orderId, to) =>
        update(orderId, (o) => ({
          ...o,
          status: 'preparing',
          assigneeId: to,
          events: [...o.events, { at: now(), byName: actorName(), text: `Փոխանցեց → ${empName(to)}` }],
        })),
      returnOrder: (orderId, reason) =>
        update(orderId, (o) => ({
          ...o,
          status: 'returned',
          events: [...o.events, { at: now(), byName: actorName(), text: `Վերադարձրեց. ${reason}` }],
        })),
    };
  }, [session, cart, orders]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
