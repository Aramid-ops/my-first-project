// Խանութի պատվերները՝ ըստ օրերի. հավելվածի մատակարարներին + WhatsApp / Viber / SMS-ով ուղարկվածները
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { deliveryLabel, formatTime, toISODate } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { shopStatusLabel } from '@/lib/types';
import { Logo, Pill, Screen, styles, Title } from '@/lib/ui';

type ExtOrder = { id: string; supplier_name: string; channel: 'whatsapp' | 'viber' | 'sms'; text: string; created_at: string };
const channelLabel = { whatsapp: 'WhatsApp', viber: 'Viber', sms: 'SMS' };

function dayTitle(iso: string) {
  const day = toISODate(new Date(iso));
  const today = new Date();
  if (day === toISODate(today)) return 'Այսօր';
  if (day === toISODate(new Date(today.getTime() - 86400000))) return 'Երեկ';
  const [, m, d] = day.split('-');
  return `${d}.${m}`;
}

export default function ShopOrders() {
  const { session, orders, firms, employees } = useStore();
  const [ext, setExt] = useState<ExtOrder[]>([]);
  const [openExt, setOpenExt] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from('external_orders')
      .select('id, supplier_name, channel, text, created_at')
      .gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .then(({ data }) => setExt((data ?? []) as ExtOrder[]));
  }, []);
  if (session?.kind !== 'shop') return <Redirect href="/" />;

  // Մեկ ցուցակ՝ նորից հին, օրերի վերնագրերով
  const rows = [
    ...orders.filter((o) => o.shopId === session.shopId).map((o) => ({ at: o.createdAt, app: o, ext: undefined })),
    ...ext.map((e) => ({ at: e.created_at, app: undefined, ext: e })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  let lastDay = '';
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.replace('/shop')} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title>Պատվերներ</Title>
      </View>

      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {rows.length === 0 ? <Text style={styles.muted}>Դեռ պատվեր չկա</Text> : null}
        {rows.map((r) => {
          const day = dayTitle(r.at);
          const header = day !== lastDay ? <Text style={[styles.strong, { color: colors.textMuted, marginTop: 6 }]}>{day}</Text> : null;
          lastDay = day;
          if (r.ext) {
            const e = r.ext;
            const open = openExt === e.id;
            return (
              <View key={e.id} style={{ gap: 10 }}>
                {header}
                <Pressable accessibilityRole="button" onPress={() => setOpenExt(open ? null : e.id)} style={[styles.card, { gap: 4 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={[styles.strong, { flex: 1 }]}>{e.supplier_name}</Text>
                    <Text style={styles.muted}>{formatTime(e.created_at)}</Text>
                  </View>
                  <Text style={styles.body} numberOfLines={open ? undefined : 2}>{e.text}</Text>
                  <Pill text={`Ուղարկված ${channelLabel[e.channel]}-ով`} tone="info" />
                </Pressable>
              </View>
            );
          }
          const o = r.app!;
          const f = firms.find((x) => x.id === o.firmId)!;
          const tone = o.status === 'returned' ? 'warn' : o.status === 'sent' ? 'info' : 'ok';
          return (
            <View key={o.id} style={{ gap: 10 }}>
              {header}
              <Pressable accessibilityRole="button" onPress={() => router.push(`/shop/order/${o.id}`)} style={[styles.card, { flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
                <Logo name={f.name} uri={f.logoUrl} bg={f.color.bg} fg={f.color.fg} size={44} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.strong}>{f.name}</Text>
                  <Text style={styles.muted}>Մենեջեր՝ {employees.find((x) => x.id === o.managerId)?.name}</Text>
                  <Text style={styles.muted}>
                    {o.items.length} ապրանք · առաքում՝ {deliveryLabel(new Date(o.deliveryDate + 'T00:00:00'))}
                  </Text>
                  <Pill text={shopStatusLabel[o.status]} tone={tone} />
                </View>
                <Text style={{ fontSize: 20, color: '#8A918D' }}>›</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
