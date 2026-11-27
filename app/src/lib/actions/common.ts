import type { ActionCtx } from '../store-types';
import { supabase } from '../supabase';

type Query = PromiseLike<{ error: { message: string } | null }>;

/** Կատարում է հարցումը, թարմացնում տվյալները և վերադարձնում սխալի տեքստը (կամ null) */
export async function run(c: ActionCtx, q: Query): Promise<string | null> {
  const { error } = await q;
  await c.reload();
  return error?.message ?? null;
}

/** Պատվերի պատմության գրառում. անունը և ժամը լրացնում է բազան (order_events_fill) */
export const addEvent = (orderId: string, text: string) => supabase.from('order_events').insert({ order_id: orderId, actor_name: '', text });
