import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { deliveryLabel, formatAmd, formatQty } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors, radius } from '@/lib/theme';
import { Button, Logo, Pill, Screen, styles, Title } from '@/lib/ui';

export default function Cart() {
  const { session, cart, products, firms, links, employees, sendCart, deliveryDate, priceOf, saveList, savedLists, applyList } = useStore();
  const [listName, setListName] = useState<string | null>(null);
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

  const total = groups.reduce((s, g) => s + g.items.reduce((a, x) => a + priceOf(x.p) * x.qty, 0), 0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title>Զամբյուղ</Title>
      </View>
      {/* Պահված ցուցակներ՝ մեկ սեղմումով լցնել զամբյուղը */}
      {savedLists.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 10 }} contentContainerStyle={{ gap: 8 }}>
          {savedLists.map((l) => (
            <Pressable key={l.id} accessibilityRole="button" onPress={() => applyList(l)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card }}>
              <Text style={styles.body}>📋 {l.name} · {l.items.length}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

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
                  <Logo name={f.name} uri={f.logoUrl} bg={f.color.bg} fg={f.color.fg} size={38} />
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
            {listName === null ? (
              <Pressable accessibilityRole="button" onPress={() => setListName('')} style={{ paddingVertical: 6 }}>
                <Text style={{ color: colors.primary, textAlign: 'center', fontWeight: '600' }}>Պահել որպես ցուցակ</Text>
              </Pressable>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput importantForAutofill="no"
                  accessibilityLabel="Ցուցակի անուն"
                  placeholder="Օր.՝ Շաբաթական"
                  value={listName}
                  onChangeText={setListName}
                  style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: 10, backgroundColor: colors.card, color: colors.text }}
                />
                <Button kind="outline" label="Պահել" disabled={!listName?.trim()} onPress={async () => { setError(await saveList(listName!.trim())); setListName(null); }} />
              </View>
            )}
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

