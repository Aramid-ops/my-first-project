// Պատվերների ընթացքը՝ ընդունել, փոխանցել, առաքել, վերադարձնել։
import { nextDeliveryDate, toISODate } from '../rules';
import type { ActionCtx, OrderActions } from '../store-types';
import { supabase } from '../supabase';
import { addEvent, run } from './common';

export function orderActions(c: ActionCtx): OrderActions {
  const lineOf = (lineId?: string) => c.lines.find((x) => x.id === lineId);
  const move = async (orderId: string, patch: Record<string, unknown>, text: string) => {
    const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
    if (!error) await addEvent(orderId, text);
    await c.reload();
    return error?.message ?? null;
  };

  return {
    setStatus: (orderId, status) => move(orderId, { status }, status === 'delivered' ? 'Առաքեց' : 'Մեկնեց'),
    setInvoice: (orderId, num) => move(orderId, { invoice_number: num || null }, `Ֆակտուրա № ${num}`),
    accept: async (orderId) => {
      await move(orderId, { status: 'accepted' }, 'Ընդունեց');
    },
    returnOrder: async (orderId, reason) => {
      await move(orderId, { status: 'returned' }, `Վերադարձրեց. ${reason}`);
    },
    forward: async (orderId, to) => {
      const target = c.employees.find((x) => x.id === to);
      const patch = target?.role === 'driver' ? { status: 'preparing', assignee_id: to, driver_id: to } : { status: 'preparing', assignee_id: to };
      await move(orderId, patch, `Փոխանցեց → ${target?.name ?? ''}`);
    },
    placeOrderForShop: async (shopId, items) => {
      if (!c.me) return 'Մուտք գործեք որպես մենեջեր';
      const link = c.links.find((l) => l.shopId === shopId && l.firmId === c.me!.firmId);
      return run(
        c,
        supabase.rpc('place_order_for_shop', {
          p_shop: shopId,
          p_firm: c.me.firmId,
          p_delivery: toISODate(nextDeliveryDate(link?.deliveryDays ?? [], new Date(), lineOf(link?.lineId)?.orderCutoff)),
          p_items: items.map((x) => ({ product_id: x.productId, qty: x.qty })),
        }),
      );
    },
    reportIssue: (orderId, productId, kind, qty, note, photoUrl) =>
      run(c, supabase.from('order_issues').insert({ order_id: orderId, product_id: productId, kind, qty, note: note || null, photo_url: photoUrl ?? null })),
    deliveryDate: (link) => nextDeliveryDate(link.deliveryDays, new Date(), lineOf(link.lineId)?.orderCutoff),
    cutoffOf: (link) => lineOf(link.lineId)?.orderCutoff,
    forwardCandidates: (order) => {
      const me = c.me;
      if (!me) return [];
      const ids = new Set(c.teams.filter((t) => t.memberIds.includes(me.id)).flatMap((t) => t.memberIds));
      const link = c.links.find((x) => x.shopId === order.shopId && x.firmId === order.firmId);
      const suggested = new Set([lineOf(link?.lineId)?.driverId, me.defaultForwardToId].filter(Boolean) as string[]);
      return c.employees
        .filter((x) => x.id !== me.id && x.firmId === me.firmId && (x.role === 'staff' || x.role === 'driver') && (ids.has(x.id) || suggested.has(x.id)))
        .map((x) => ({ employee: x, suggested: suggested.has(x.id) }))
        .sort((a, b) => Number(b.suggested) - Number(a.suggested));
    },
  };
}
