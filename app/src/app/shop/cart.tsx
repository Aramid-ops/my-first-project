import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { deliveryLabel, formatAmd, formatQty } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { Button, Logo, Pill, Screen, styles, Title } from '@/lib/ui';

export default function Cart() {
  const { session, cart, products, firms, links, employees, sendCart, deliveryDate } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (session?.kind !== 'shop') return <Redirect href="/" />;

  const groups = firms
    .map((f) => {
      const items = Object.entries(cart)
        .map(([pid, qty]) => ({ p: products.find((x) => x.id === pid)!, qty }))
        .filter((x) => x.p && x.p.firmId === f.id);
      const link = links.find((l) => l.shopId === session.shopId && l.firmId === f.id);
      const manager = employees.find((e) => e.id === link?.managerId);
      return { f, items, link, manager };
    })
    .filter((g) => g.items.length > 0 && g.link);

  const total = groups.reduce((s, g) => s + g.items.reduce((a, x) => a + x.p.price * x.qty, 0), 0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title>Զամբյուղ</Title>
      </View>

      {groups.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text style={styles.muted}>Զամբյուղը դատարկ է</Text>
          <Button kind="outline" label="Մատակարարներ" onPress={() => router.replace('/shop')} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
            {groups.map(({ f, items, link, manager }) => (
              <View key={f.id} style={[styles.card, { gap: 8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Logo name={f.name} bg={f.color.bg} fg={f.color.fg} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.strong}>{f.name}</Text>
                    <Text style={styles.muted}>Մենեջեր՝ {manager?.name}</Text>
                  </View>
                  <Pill text={deliveryLabel(deliveryDate(link!))} />
                </View>
                {items.map(({ p, qty }) => (
                  <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F0EEE7', paddingTop: 8 }}>
                    <Text style={[styles.body, { flex: 1 }]}>{p.name}</Text>
                    <Text style={styles.muted}>{formatQty(p, qty)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <View style={{ gap: 8, paddingBottom: 20 }}>
            {error ? <Text style={{ color: '#8A3A0E', textAlign: 'center' }}>{error}</Text> : null}
            <Text style={[styles.muted, { textAlign: 'center' }]}>
              Մոտավոր գումար՝ {formatAmd(total)} · ամեն մատակարար կստանա միայն իր մասը
            </Text>
            <Button
              label={`Ուղարկել ${groups.length} մատակարարին`}
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                setError(null);
                const err = await sendCart();
                setBusy(false);
                if (err) setError(err);
                else router.replace('/shop/orders');
              }}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

