// Խանութի զամբյուղը և պահված ցուցակները։
import { nextDeliveryDate, toISODate } from '../rules';
import type { ActionCtx, CartActions } from '../store-types';
import { supabase } from '../supabase';
import { run } from './common';

export function cartActions(c: ActionCtx): CartActions {
  /** Ավելացնում է միայն առկա ապրանքները, վերադարձնում՝ քանիսը */
  const addItems = (items: { productId: string; qty: number }[]) => {
    const ok = items.filter((it) => c.products.find((p) => p.id === it.productId)?.inStock);
    c.setCart((cart) => ({ ...cart, ...Object.fromEntries(ok.map((it) => [it.productId, it.qty])) }));
    return ok.length;
  };
  const removeItems = (ids: string[]) =>
    c.setCart((cart) => {
      const next = { ...cart };
      for (const id of ids) delete next[id];
      return next;
    });

  return {
    cart: c.cart,
    priceOf: (p) => c.prices[p.id] ?? p.price,
    setQty: (productId, qty) => (qty <= 0 ? removeItems([productId]) : c.setCart((cart) => ({ ...cart, [productId]: qty }))),
    repeatOrder: (order) => addItems(order.items),
    applyList: (list) => addItems(list.items),
    saveList: async (name) => {
      if (c.session?.kind !== 'shop') return 'Մուտք գործեք որպես խանութ';
      const items = Object.entries(c.cart).map(([product_id, qty]) => ({ product_id, qty }));
      return run(c, supabase.from('saved_lists').insert({ shop_id: c.session.shopId, name, items }));
    },
    deleteList: async (id) => {
      await run(c, supabase.from('saved_lists').delete().eq('id', id));
    },
    sendCart: async () => {
      const s = c.session;
      if (s?.kind !== 'shop') return 'Մուտք գործեք որպես խանութ';
      const byFirm = new Map<string, string[]>();
      for (const pid of Object.keys(c.cart)) {
        const p = c.products.find((x) => x.id === pid);
        if (p) byFirm.set(p.firmId, [...(byFirm.get(p.firmId) ?? []), pid]);
      }
      // Ամեն մատակարարի համար՝ մեկ ատոմային գործողություն (place_order).
      // Գինը, քանակի կանոնները և մենեջերը ստուգում/լրացնում է բազան։
      for (const [firmId, ids] of byFirm) {
        const link = c.links.find((l) => l.shopId === s.shopId && l.firmId === firmId);
        if (!link) continue;
        const { error } = await supabase.rpc('place_order', {
          p_shop: s.shopId,
          p_firm: firmId,
          p_delivery: toISODate(nextDeliveryDate(link.deliveryDays, new Date(), c.lines.find((x) => x.id === link.lineId)?.orderCutoff)),
          p_items: ids.map((id) => ({ product_id: id, qty: c.cart[id] })),
        });
        if (error) {
          await c.reload();
          return error.message;
        }
        // Հաջողված մասը հանում ենք զամբյուղից, որ կրկնակի չուղարկվի
        removeItems(ids);
      }
      c.setCart({});
      await c.reload();
      return null;
    },
  };
}
