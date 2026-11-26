import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { deliveryLabel } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Button, Logo, Screen, styles, Title } from '@/lib/ui';

export default function ShopHome() {
  const { session, shops, links, firms, employees, cart, orders, signOut, deliveryDate } = useStore();
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const shop = shops.find((s) => s.id === session.shopId)!;
  if (!shop) return <Redirect href="/" />;
  const myLinks = links.filter((l) => l.shopId === shop.id && l.status === 'active');
  const pending = links.filter((l) => l.shopId === shop.id && l.status === 'pending');
  const cartCount = Object.keys(cart).length;
  const myOrders = orders.filter((o) => o.shopId === shop.id).length;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.dark }}>Մատակարար</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/shop/profile')} hitSlop={12}>
            <Text style={styles.muted}>Իմ տվյալները</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { signOut(); router.replace('/'); }} hitSlop={12}>
            <Text style={styles.muted}>Դուրս գալ</Text>
          </Pressable>
        </View>
      </View>
      <Title sub={shop.name}>Իմ մատակարարները</Title>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Որոնում"
        onPress={() => router.push('/shop/search')}
        style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, marginBottom: 12 }]}>
        <Text style={{ fontSize: 16 }}>🔍</Text>
        <Text style={styles.muted}>Ապրանք, մատակարար կամ արտիկուլ</Text>
      </Pressable>

      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {myLinks.length === 0 && pending.length === 0 ? (
          <Text style={styles.muted}>Գտեք մատակարարին որոնումով և սեղմեք «Միանալ»</Text>
        ) : null}
        {pending.map((l) => (
          <View key={l.firmId} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <Text style={[styles.strong, { flex: 1 }]}>{firms.find((f) => f.id === l.firmId)?.name}</Text>
            <Text style={styles.muted}>Հայտը սպասում է</Text>
          </View>
        ))}
        {myLinks.map((l) => {
          const f = firms.find((x) => x.id === l.firmId)!;
          const m = employees.find((e) => e.id === l.managerId);
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              onPress={() => router.push(`/shop/supplier/${f.id}`)}
              style={({ pressed }) => [styles.card, { flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.8 : 1 }]}>
              <Logo name={f.name} bg={f.color.bg} fg={f.color.fg} size={56} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.strong}>{f.name}</Text>
                {m ? <Text style={styles.muted}>Մենեջեր՝ {m.name}</Text> : null}
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                  Առաքում՝ {deliveryLabel(deliveryDate(l))}
                </Text>
              </View>
              <Text style={{ fontSize: 20, color: colors.textMuted }}>›</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 20 }}>
        <Button kind="outline" label={`Պատվերներ${myOrders ? ` · ${myOrders}` : ''}`} onPress={() => router.push('/shop/orders')} style={{ flex: 1 }} />
        <Button kind="outline" label="Հաշիվներ" onPress={() => router.push('/shop/debts')} style={{ flex: 1 }} />
        <Button kind="dark" label={`Զամբյուղ${cartCount ? ` · ${cartCount}` : ''}`} onPress={() => router.push('/shop/cart')} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}
