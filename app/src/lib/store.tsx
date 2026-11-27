// Հավելվածի վիճակը՝ Supabase-ի հետ։
// Ամեն օգտատեր բազայից ստանում է միայն իրեն թույլատրվածը (RLS)։
//
// Կառուցվածքը.
//   store-types.ts  — տիպեր (Session, Store, Data)
//   data.ts         — բազայից բեռնում + պահում հեռախոսում (առանց ինտերնետի)
//   mappers.ts      — բազայի տողեր → հավելվածի տիպեր
//   actions/*.ts    — գործողություններ՝ ըստ թեմայի (պատվերներ, զամբյուղ, խանութ, ֆիրմա)
import type { Session as AuthSession } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { cartActions } from './actions/cart';
import { firmActions } from './actions/firm';
import { orderActions } from './actions/orders';
import { shopActions } from './actions/shop';
import { emptyData, loadData } from './data';
import { registerPush } from './push';
import type { ActionCtx, Cart, Data, Store } from './store-types';
import { supabase } from './supabase';

export type { Session, Store } from './store-types';

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Data>(emptyData);
  const [cart, setCart] = useState<Cart>({});

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
      setData(emptyData);
      return;
    }
    const d = await loadData(auth.user.id);
    if (d) setData(d);
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
    const s = data.session;
    const me = s?.kind === 'employee' ? data.employees.find((x) => x.id === s.employeeId) : undefined;
    const c: ActionCtx = { ...data, me, cart, setCart, reload };
    return {
      ...data,
      ...orderActions(c),
      ...cartActions(c),
      ...shopActions(c),
      ...firmActions(c),
      ready,
      reload,
      userEmail: auth?.user.email ?? undefined,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? error.message : null;
      },
      signOut: async () => {
        setCart({});
        setData(emptyData);
        await supabase.auth.signOut();
      },
      acceptInvite: async (code) => {
        const { data: firm, error } = await supabase.rpc('accept_invite', { p_code: code });
        await reload();
        return error ? { error: error.message } : { firm: firm as string };
      },
    };
  }, [data, cart, ready, auth, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
