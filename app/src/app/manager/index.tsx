import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { deliveryLabel, formatQty, formatTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { ForwardPicker } from '@/components/forward-picker';
import { Button, Chips, Pill, Screen, styles, Title } from '@/lib/ui';

export default function ManagerInbox() {
  const { session, employees, firms, orders, shops, products, links, lines, accept, setLinkLine, signOut } = useStore();
  const [tab, setTab] = useState<'orders' | 'shops'>('orders');
  if (session?.kind !== 'employee') return <Redirect href="/" />;
  const me = employees.find((e) => e.id === session.employeeId)!;
  const firm = firms.find((f) => f.id === me.firmId)!;
  const isManager = me.role === 'manager';
  const roleLabel = isManager ? 'մենեջեր' : me.department ?? (me.role === 'driver' ? 'վարորդ' : 'աշխատող');
  const myLinks = links.filter((l) => l.managerId === me.id);
  const firmLines = lines.filter((l) => l.firmId === me.firmId);

  // Մենեջեր՝ իր խանութների նոր պատվերները; ներքին աշխատող՝ իրեն փոխանցվածները
  const waiting = isManager
    ? orders.filter((o) => o.managerId === me.id && (o.status === 'sent' || o.status === 'accepted'))
    : orders.filter((o) => o.assigneeId === me.id && o.status === 'preparing');
  const done = isManager
    ? orders.filter((o) => o.managerId === me.id && !(o.status === 'sent' || o.status === 'accepted'))
    : orders.filter((o) => o.assigneeId !== me.id && o.events.some((ev) => ev.byName === me.name));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.dark }}>Մատակարար</Text>
        <Pressable accessibilityRole="button" onPress={() => { signOut(); router.replace('/'); }} hitSlop={12}>
          <Text style={styles.muted}>Դուրս գալ</Text>
        </Pressable>
      </View>
      <Title sub={`${firm.name} · ${roleLabel}`}>Բարև, {me.name}</Title>

      {isManager ? (
        <View style={{ marginBottom: 12 }}>
          <Chips
            options={[
              { value: 'orders', label: 'Պատվերներ', hint: `${waiting.length}` },
              { value: 'shops', label: 'Իմ խանութները', hint: `${myLinks.length}` },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
      ) : null}

      {isManager && tab === 'shops' ? (
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
          {myLinks.length === 0 ? <Text style={styles.muted}>Դեռ կցված խանութ չկա</Text> : null}
          {myLinks.map((l) => {
            const shop = shops.find((s) => s.id === l.shopId);
            return (
              <View key={l.shopId} style={[styles.card, { gap: 8 }]}>
                <Text style={styles.strong}>{shop?.name}</Text>
                <Text style={styles.muted}>{[shop?.district, shop?.address].filter(Boolean).join(' · ')}</Text>
                <Text style={styles.muted}>Գիծ՝</Text>
                <Chips
                  options={firmLines.map((x) => ({ value: x.id, label: x.name, hint: x.deliveryDays.length ? x.deliveryDays.map((d) => ['', 'երկ', 'երք', 'չրք', 'հնգ', 'ուրբ', 'շբթ', 'կիր'][d]).join(', ') : 'ամեն օր' }))}
                  value={l.lineId ?? null}
                  onChange={(v) => setLinkLine(l.shopId, l.firmId, v)}
                />
              </View>
            );
          })}
        </ScrollView>
      ) : (
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        <Text style={[styles.strong, { fontSize: 15 }]}>Նոր պատվերներ · {waiting.length}</Text>
        {waiting.length === 0 ? <Text style={styles.muted}>Նոր պատվեր չկա</Text> : null}
        {waiting.map((o) => {
          const shop = shops.find((s) => s.id === o.shopId)!;
          return (
            <View key={o.id} style={[styles.card, { gap: 10 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.strong}>{shop.name}</Text>
                <Text style={styles.muted}>{formatTime(o.createdAt)}</Text>
              </View>
              <Text style={styles.muted}>
                {shop.district} · առաքում՝ {deliveryLabel(new Date(o.deliveryDate + 'T00:00:00'))}
              </Text>
              {o.items.map((it) => {
                const p = products.find((x) => x.id === it.productId)!;
                return (
                  <View key={it.productId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.body, { flex: 1 }]}>{p.name}</Text>
                    <Text style={styles.muted}>{formatQty(p, it.qty)}</Text>
                  </View>
                );
              })}
              {isManager && o.status === 'sent' ? <Button label="Ընդունել" onPress={() => accept(o.id)} /> : <ForwardPicker order={o} />}
            </View>
          );
        })}

        {done.length > 0 ? <Text style={[styles.strong, { fontSize: 15, marginTop: 8 }]}>Փոխանցված</Text> : null}
        {done.map((o) => {
          const shop = shops.find((s) => s.id === o.shopId)!;
          const last = o.events[o.events.length - 1];
          return (
            <View key={o.id} style={[styles.card, { gap: 6 }]}>
              <Text style={styles.strong}>{shop.name}</Text>
              <Pill text={last.text} tone="ok" />
            </View>
          );
        })}
      </ScrollView>
      )}
    </Screen>
  );
}
