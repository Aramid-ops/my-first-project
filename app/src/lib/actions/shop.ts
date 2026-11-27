// Խանութի գործողություններ՝ միանալ մատակարարին, տվյալներ, վճարում։
import type { ActionCtx, ShopActions } from '../store-types';
import { supabase } from '../supabase';
import { run } from './common';

export function shopActions(c: ActionCtx): ShopActions {
  const shopId = c.session?.kind === 'shop' ? c.session.shopId : null;
  const notShop = async () => 'Մուտք գործեք որպես խանութ';
  return {
    requestJoin: (firmId) => run(c, supabase.rpc('request_join', { p_firm: firmId })),
    updateShop: (patch) => (shopId ? run(c, supabase.from('shops').update(patch).eq('id', shopId)) : notShop()),
    markPaid: (firmId, amount, note) =>
      shopId ? run(c, supabase.from('payments').insert({ shop_id: shopId, firm_id: firmId, amount, note: note || null })) : notShop(),
  };
}
