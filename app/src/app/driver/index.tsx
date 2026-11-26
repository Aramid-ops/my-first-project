// Վարորդ. միայն ուր գնալ և ինչ տանել (docs/SPEC.md §7.4)։ Աշխատում է առանց ինտերնետի։
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { applyOutbox, loadOutbox, openRoute, saveOutbox, syncOutbox, type DriverAction } from '@/lib/driver-offline';
import { formatQty, formatTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Button, Screen, styles } from '@/lib/ui';

export default function DriverStops() {
  const { session, employees, orders, shops, products, reload, signOut } = useStore();
  const [uid, setUid] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<DriverAction[]>([]);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id ?? null;
      setUid(id);
      if (id) loadOutbox(id).then(setOutbox);
    });
  }, []);

  // Փորձում ենք ուղարկել հերթը և թարմացնել տվյալները. սկզբում և ամեն 20 վայրկյանը մեկ
  const sync = useCallback(async () => {
    if (!uid) return;
    const left = await syncOutbox(uid);
    setOutbox(left);
    const ping = await supabase.from('orders').select('id', { head: true, count: 'exact' });
    const ok = !ping.error && left.length === 0;
    setOnline(!ping.error);
    if (ok) {
      await reload();
      setLastSync(new Date().toISOString());
    }
  }, [uid, reload]);

  useEffect(() => {
    sync();
    const t = setInterval(sync, 20000);
    return () => clearInterval(t);
  }, [sync]);

  const me = session?.kind === 'employee' ? employees.find((e) => e.id === session.employeeId) : undefined;

  const stops = useMemo(() => {
    if (!me) return [];
    return applyOutbox(orders, outbox)
      .filter((o) => o.driverId === me.id && ['preparing', 'on_the_way', 'delivered'].includes(o.status))
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate) || a.createdAt.localeCompare(b.createdAt));
  }, [orders, outbox, me]);

  if (session?.kind !== 'employee' || !me) return <Redirect href="/" />;

  const open = stops.filter((o) => o.status !== 'delivered');
  const done = stops.filter((o) => o.status === 'delivered');
  const current = open.find((o) => o.id === pickedId) ?? open[0];
  const shop = current ? shops.find((s) => s.id === current.shopId) : undefined;
  const manager = current ? employees.find((e) => e.id === current.managerId) : undefined;

  const act = async (status: DriverAction['status']) => {
    if (!uid || !current) return;
    const next = [...outbox, { id: `${Date.now()}`, orderId: current.id, status, at: new Date().toISOString() }];
    setOutbox(next);
    await saveOutbox(uid, next);
    if (status === 'delivered') setPickedId(null);
    sync();
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ gap: 2 }}>
          <Text style={styles.muted}>Վարորդ · {me.name}</Text>
          <Text style={styles.title}>
            Այսօր՝ {done.length} / {stops.length}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => { signOut(); router.replace('/'); }} hitSlop={12}>
          <Text style={styles.muted}>Դուրս գալ</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: online ? colors.primary : colors.accent }} />
        <Text style={styles.muted}>
          {online ? 'Կապ կա' : 'Առանց ինտերնետի · տվյալները պահված են հեռախոսում'}
          {outbox.length ? ` · չուղարկված՝ ${outbox.length}` : ''}
          {lastSync ? ` · ${formatTime(lastSync)}` : ''}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {current && shop ? (
          <View style={{ backgroundColor: colors.dark, borderRadius: 20, padding: 16, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>{shop.name}</Text>
                <Text style={{ color: colors.onDarkMuted, fontSize: 13 }}>
                  {[shop.district, shop.address].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {shop.phone ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Զանգել խանութին"
                  onPress={() => Linking.openURL(`tel:${shop.phone}`)}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.darkSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16 }}>📞</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={{ backgroundColor: colors.darkSoft, borderRadius: radius.md, paddingHorizontal: 14 }}>
              {current.items.map((it, i) => {
                const p = products.find((x) => x.id === it.productId);
                return (
                  <View
                    key={it.productId}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: '#8F3D55' }}>
                    <Text style={{ color: '#FFFFFF', flex: 1, fontSize: 15 }}>{p?.name ?? 'Ապրանք'}</Text>
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>{p ? formatQty(p, it.qty) : it.qty}</Text>
                  </View>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button kind="outline" label="Ճանապարհ" onPress={() => openRoute(shop)} style={{ flex: 1 }} />
              {current.status === 'preparing' ? (
                <Button label="Մեկնեցի" onPress={() => act('on_the_way')} style={{ flex: 1 }} />
              ) : (
                <Button label="Առաքված ✓" onPress={() => act('delivered')} style={{ flex: 1 }} />
              )}
            </View>
            {manager?.phone ? (
              <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${manager.phone}`)} hitSlop={8}>
                <Text style={{ color: colors.onDarkMuted, textAlign: 'center' }}>Խնդիր կա · զանգել մենեջերին ({manager.name})</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={[styles.card, { gap: 6 }]}>
            <Text style={styles.strong}>{stops.length ? 'Բոլոր կանգառներն ավարտված են 🎉' : 'Այսօր պատվեր չկա'}</Text>
            <Text style={styles.muted}>Նոր պատվերները կհայտնվեն, երբ կապ լինի</Text>
          </View>
        )}

        {open.length > 1 ? <Text style={[styles.strong, { fontSize: 15, marginTop: 6 }]}>Հաջորդ կանգառները</Text> : null}
        {open
          .filter((o) => o.id !== current?.id)
          .map((o) => {
            const s = shops.find((x) => x.id === o.shopId);
            return (
              <Pressable
                key={o.id}
                accessibilityRole="button"
                onPress={() => setPickedId(o.id)}
                style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                <Text style={[styles.strong, { flex: 1 }]}>{s?.name}</Text>
                <Text style={styles.muted}>{o.status === 'on_the_way' ? 'Ճանապարհին' : `${o.items.length} ապրանք`}</Text>
              </Pressable>
            );
          })}

        {done.length ? <Text style={[styles.strong, { fontSize: 15, marginTop: 6 }]}>Առաքված</Text> : null}
        {done.map((o) => (
          <View key={o.id} style={[styles.card, { opacity: 0.6, flexDirection: 'row', justifyContent: 'space-between' }]}>
            <Text style={styles.body}>{shops.find((x) => x.id === o.shopId)?.name}</Text>
            <Text style={styles.muted}>✓</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
