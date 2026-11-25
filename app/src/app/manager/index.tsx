import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { deliveryLabel, formatQty, formatTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Button, Pill, Screen, styles, Title } from '@/lib/ui';

export default function ManagerInbox() {
  const { session, employees, firms, orders, shops, products, accept, forward, signOut } = useStore();
  if (session?.kind !== 'employee') return null;
  const me = employees.find((e) => e.id === session.employeeId)!;
  const firm = firms.find((f) => f.id === me.firmId)!;
  const target = employees.find((e) => e.id === me.defaultForwardToId);

  const mine = orders.filter((o) => o.managerId === me.id);
  const waiting = mine.filter((o) => o.status === 'sent' || o.status === 'accepted');
  const done = mine.filter((o) => !(o.status === 'sent' || o.status === 'accepted'));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.dark }}>Մատակարար</Text>
        <Pressable accessibilityRole="button" onPress={() => { signOut(); router.replace('/'); }} hitSlop={12}>
          <Text style={styles.muted}>Դուրս գալ</Text>
        </Pressable>
      </View>
      <Title sub={`${firm.name} · մենեջեր`}>Բարև, {me.name}</Title>

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
              {o.status === 'sent' ? (
                <Button label="Ընդունել" onPress={() => accept(o.id)} />
              ) : target ? (
                <Button kind="dark" label={`Փոխանցել → ${target.name}${target.department ? ` (${target.department})` : ''}`} onPress={() => forward(o.id, target.id)} />
              ) : null}
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
    </Screen>
  );
}
