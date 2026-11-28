// Մենեջերը պատվեր է ստեղծում խանութի անունից (երբ խանութը զանգում է)
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { decQty, formatAmd, incQty } from '@/lib/rules';
import { matches } from '@/lib/search';
import { useStore } from '@/lib/store';
import { colors, radius } from '@/lib/theme';
import { Button, Screen, styles, Title } from '@/lib/ui';

export default function NewOrderForShop() {
  const { shopId, text } = useLocalSearchParams<{ shopId: string; text?: string }>();
  const { session, employees, shops, products, textOrders, placeOrderForShop, finishTextOrder } = useStore();
  const textOrder = textOrders.find((t) => t.id === text);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const me = session?.kind === 'employee' ? employees.find((e) => e.id === session.employeeId) : undefined;
  const shop = shops.find((s) => s.id === shopId);
  if (!me || !shop) return <Redirect href="/" />;
  const list = products.filter((p) => p.firmId === me.firmId && p.inStock && (matches(p.name, filter) || (p.sku ?? '').toLowerCase().startsWith(filter.trim().toLowerCase())));
  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([productId, q]) => ({ productId, qty: q }));
  const total = items.reduce((sum, it) => sum + (products.find((p) => p.id === it.productId)?.price ?? 0) * it.qty, 0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub="Նոր պատվեր խանութի անունից">{shop.name}</Title>
      </View>
      {textOrder ? (
        <View style={[styles.card, { marginBottom: 10, gap: 4, borderColor: colors.primary }]}>
          <Text style={styles.muted}>📝 Խանութի տեքստը</Text>
          <Text style={[styles.body, { fontSize: 16 }]}>{textOrder.text}</Text>
        </View>
      ) : null}
      <TextInput placeholderTextColor={colors.textMuted} importantForAutofill="no"
        accessibilityLabel="Որոնել ապրանք"
        placeholder="Որոնել ապրանք կամ արտիկուլ"
        value={filter}
        onChangeText={setFilter}
        autoCorrect={false}
        style={{ minHeight: 46, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 15, backgroundColor: colors.card, marginBottom: 10, color: colors.text }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
        {list.map((p) => {
          const q = qty[p.id] ?? 0;
          return (
            <View key={p.id} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>{p.name}</Text>
                <Text style={styles.muted}>
                  {p.sku ? `${p.sku} · ` : ''}
                  {formatAmd(p.price)} / {p.unit}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Պակասեցնել" onPress={() => setQty({ ...qty, [p.id]: decQty(p, q) })} style={step}>
                <Text style={{ fontSize: 18 }}>−</Text>
              </Pressable>
              <Text style={{ minWidth: 52, textAlign: 'center', fontWeight: '600' }}>{q}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Ավելացնել" onPress={() => setQty({ ...qty, [p.id]: incQty(p, q) })} style={[step, { backgroundColor: colors.primary }]}>
                <Text style={{ fontSize: 18, color: '#FFFFFF' }}>+</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ gap: 8, paddingBottom: 20 }}>
        {err ? <Text style={{ color: colors.warnText, textAlign: 'center' }}>{err}</Text> : null}
        <Button
          label={busy ? 'Ստեղծվում է…' : `Ստեղծել պատվեր · ${formatAmd(total)}`}
          disabled={busy || items.length === 0}
          onPress={async () => {
            setBusy(true);
            const e = await placeOrderForShop(shop.id, items);
            setBusy(false);
            if (e) setErr(e);
            else {
              if (textOrder) await finishTextOrder(textOrder.id);
              if (router.canGoBack()) router.back();
              else router.replace('/manager');
            }
          }}
        />
      </View>
    </Screen>
  );
}

const step = { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: '#F2F1EC', alignItems: 'center', justifyContent: 'center' } as const;
