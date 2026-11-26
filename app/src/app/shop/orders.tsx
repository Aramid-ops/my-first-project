import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { deliveryLabel } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { shopStatusLabel } from '@/lib/types';
import { Logo, Pill, Screen, styles, Title } from '@/lib/ui';

export default function ShopOrders() {
  const { session, orders, firms, employees } = useStore();
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const mine = orders.filter((o) => o.shopId === session.shopId);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.replace('/shop')} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title>Պատվերներ</Title>
      </View>

      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {mine.length === 0 ? <Text style={styles.muted}>Դեռ պատվեր չկա</Text> : null}
        {mine.map((o) => {
          const f = firms.find((x) => x.id === o.firmId)!;
          const status = shopStatusLabel[o.status];
          const tone = o.status === 'returned' ? 'warn' : o.status === 'sent' ? 'info' : 'ok';
          return (
            <Pressable key={o.id} accessibilityRole="button" onPress={() => router.push(`/shop/order/${o.id}`)} style={[styles.card, { flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
              <Logo name={f.name} bg={f.color.bg} fg={f.color.fg} size={44} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.strong}>{f.name}</Text>
                <Text style={styles.muted}>Մենեջեր՝ {employees.find((e) => e.id === o.managerId)?.name}</Text>
                <Text style={styles.muted}>
                  {o.items.length} ապրանք · առաքում՝ {deliveryLabel(new Date(o.deliveryDate + 'T00:00:00'))}
                </Text>
                <Pill text={status} tone={tone} />
              </View>
              <Text style={{ fontSize: 20, color: '#8A918D' }}>›</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
