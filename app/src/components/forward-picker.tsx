// «Փոխանցել» → պատուհան վարորդների ցուցակով.
// · կանաչ = այսօր սեղմել է «Գործի եմ»
// · քանի բաց պատվեր ունի, որ խանութներն են (սեղմելով)
// · ⭐ = խանութի գծի վարորդը / լռելյայնը
// · ներքևում՝ իմ խմբի ներքին աշխատողները
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { Order } from '@/lib/types';
import { Button, styles } from '@/lib/ui';

type Load = { driver_id: string; name: string; checked_in: boolean; open_orders: number; shop_names: string[] };

export function ForwardPicker({ order }: { order: Order }) {
  const { forwardCandidates, forward, shops } = useStore();
  const [open, setOpen] = useState(false);
  const [loads, setLoads] = useState<Load[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoads(null);
    supabase.rpc('driver_load').then(({ data }) => setLoads((data ?? []) as Load[]));
  }, [open]);

  const candidates = forwardCandidates(order);
  const suggested = new Set(candidates.filter((c) => c.suggested).map((c) => c.employee.id));
  const staff = candidates.filter((c) => c.employee.role !== 'driver');
  const shopName = shops.find((s) => s.id === order.shopId)?.name ?? '';
  const drivers = [...(loads ?? [])].sort(
    (a, b) => Number(suggested.has(b.driver_id)) - Number(suggested.has(a.driver_id)) || Number(b.checked_in) - Number(a.checked_in) || a.open_orders - b.open_orders,
  );

  const send = async (id: string) => {
    setBusy(true);
    await forward(order.id, id);
    setBusy(false);
    setOpen(false);
  };

  return (
    <>
      <Button kind="dark" label="Փոխանցել…" onPress={() => setOpen(true)} />
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Փակել" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(23,32,28,0.35)' }} />
        <View style={{ maxHeight: '85%', backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={styles.muted}>Փոխանցել պատվերը</Text>
              <Text style={[styles.strong, { fontSize: 18 }]}>{shopName}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Փակել" onPress={() => setOpen(false)} hitSlop={12}>
              <Text style={{ fontSize: 22, color: colors.textMuted }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            <Text style={[styles.strong, { fontSize: 14, color: colors.textMuted }]}>Վարորդներ</Text>
            {loads === null ? <Text style={styles.muted}>Բեռնվում է…</Text> : null}
            {drivers.map((d) => {
              const isOpen = expanded === d.driver_id;
              return (
                <View key={d.driver_id} style={[styles.card, { gap: 8, borderColor: suggested.has(d.driver_id) ? colors.primary : colors.border }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${d.name}, ${d.checked_in ? 'գործի է' : 'դեռ գործի չէ'}, ${d.open_orders} պատվեր`}
                    onPress={() => setExpanded(isOpen ? null : d.driver_id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: d.checked_in ? '#2E9E5B' : '#C9CCC6' }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.strong}>
                        {suggested.has(d.driver_id) ? '⭐ ' : ''}
                        {d.name}
                      </Text>
                      <Text style={styles.muted}>
                        {d.checked_in ? 'Գործի է' : 'Դեռ գործի չէ'} · {d.open_orders} պատվեր
                      </Text>
                    </View>
                    <Text style={{ color: colors.textMuted }}>{isOpen ? '▲' : '▼'}</Text>
                  </Pressable>
                  {isOpen ? (
                    <View style={{ gap: 2, paddingLeft: 22 }}>
                      {d.shop_names.length ? d.shop_names.map((n) => <Text key={n} style={styles.muted}>• {n}</Text>) : <Text style={styles.muted}>Բաց պատվեր չունի</Text>}
                    </View>
                  ) : null}
                  <Button label={`Ուղարկել → ${d.name}`} disabled={busy} onPress={() => send(d.driver_id)} style={{ minHeight: 44 }} />
                </View>
              );
            })}

            {staff.length ? <Text style={[styles.strong, { fontSize: 14, color: colors.textMuted, marginTop: 6 }]}>Աշխատողներ</Text> : null}
            {staff.map(({ employee: e, suggested: s }) => (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => send(e.id)}
                style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md }]}>
                <Text style={[styles.strong, { flex: 1 }]}>
                  {s ? '⭐ ' : ''}
                  {e.name}
                </Text>
                <Text style={styles.muted}>{e.department ?? 'աշխատող'}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
