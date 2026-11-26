import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { deliveryLabel, nextDeliveryDate } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Button, Logo, Screen, styles, Title } from '@/lib/ui';

export default function ShopHome() {
  const { session, shops, links, firms, employees, cart, orders, signOut } = useStore();
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const shop = shops.find((s) => s.id === session.shopId)!;
  const myLinks = links.filter((l) => l.shopId === shop.id && l.status === 'active');
  const cartCount = Object.keys(cart).length;
  const myOrders = orders.filter((o) => o.shopId === shop.id).length;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.dark }}>Մատակարար</Text>
        <Pressable accessibilityRole="button" onPress={() => { signOut(); router.replace('/'); }} hitSlop={12}>
          <Text style={styles.muted}>Դուրս գալ</Text>
        </Pressable>
      </View>
      <Title sub={shop.name}>Իմ մատակարարները</Title>

      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {myLinks.map((l) => {
          const f = firms.find((x) => x.id === l.firmId)!;
          const m = employees.find((e) => e.id === l.managerId)!;
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              onPress={() => router.push(`/shop/supplier/${f.id}`)}
              style={({ pressed }) => [styles.card, { flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.8 : 1 }]}>
              <Logo name={f.name} bg={f.color.bg} fg={f.color.fg} size={56} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.strong}>{f.name}</Text>
                <Text style={styles.muted}>Մենեջեր՝ {m.name}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                  Առաքում՝ {deliveryLabel(nextDeliveryDate(l.deliveryDays))}
                </Text>
              </View>
              <Text style={{ fontSize: 20, color: colors.textMuted }}>›</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 20 }}>
        <Button kind="outline" label={`Պատվերներ${myOrders ? ` · ${myOrders}` : ''}`} onPress={() => router.push('/shop/orders')} style={{ flex: 1 }} />
        <Button kind="dark" label={`Զամբյուղ${cartCount ? ` · ${cartCount}` : ''}`} onPress={() => router.push('/shop/cart')} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}
