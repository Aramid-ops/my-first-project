import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { matches } from '@/lib/search';
import { decQty, deliveryLabel, formatAmd, incQty } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors, radius } from '@/lib/theme';
import { Button, Logo, Pill, Screen, styles } from '@/lib/ui';

export default function SupplierCatalog() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, firms, links, employees, products, cart, setQty, deliveryDate, cutoffOf, priceOf } = useStore();
  const [filter, setFilter] = useState('');
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const firm = firms.find((f) => f.id === id);
  const link = links.find((l) => l.shopId === session.shopId && l.firmId === id);
  if (!firm || !link) return null;
  const manager = employees.find((e) => e.id === link.managerId)!;
  const list = products.filter((p) => p.firmId === firm.id && (matches(`${p.name} ${p.packNote ?? ''}`, filter) || (p.sku ?? '').toLowerCase().startsWith(filter.trim().toLowerCase())));
  const inCart = Object.keys(cart).length;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} style={backBtn}>
          <Text style={{ fontSize: 20 }}>‹</Text>
        </Pressable>
        <Logo name={firm.name} uri={firm.logoUrl} bg={firm.color.bg} fg={firm.color.fg} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.strong, { fontSize: 18 }]}>{firm.name}</Text>
          <Text style={styles.muted}>
            {manager.name} · առաքում՝ {deliveryLabel(deliveryDate(link))}
            {cutoffOf(link) ? ` · պատվիրեք մինչև ${cutoffOf(link)}` : ''}
          </Text>
        </View>
        {manager.phone ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Զանգել մենեջերին (${manager.name})`}
            onPress={() => Linking.openURL(`tel:${manager.phone}`)}
            style={[backBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
            <Text style={{ fontSize: 16 }}>📞</Text>
          </Pressable>
        ) : null}
      </View>

      <TextInput importantForAutofill="no"
        value={filter}
        onChangeText={setFilter}
        placeholder="Որոնել այս մատակարարի մոտ"
        accessibilityLabel="Որոնել այս մատակարարի մոտ"
        autoCorrect={false}
        autoCapitalize="none"
        style={{ minHeight: 46, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 15, backgroundColor: colors.card, marginBottom: 10, color: colors.text }}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/shop/dictate/${firm.id}`)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft, marginBottom: 10 }}>
        <Text style={{ fontSize: 20 }}>🎤</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.strong}>Գրել կամ թելադրել պատվերը</Text>
          <Text style={styles.muted}>Ասեք ձայնով, ստուգեք տեքստը և ուղարկեք մենեջերին</Text>
        </View>
        <Text style={{ fontSize: 18, color: colors.textMuted }}>›</Text>
      </Pressable>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {list.map((p) => {
          const qty = cart[p.id] ?? 0;
          return (
            <View key={p.id} style={[styles.card, { gap: 6, opacity: p.inStock ? 1 : 0.55 }]}>
              {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={{ width: '100%', height: 140, borderRadius: radius.md }} contentFit="cover" accessibilityLabel={p.name} /> : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={[styles.strong, { flex: 1 }]}>{p.name}</Text>
                {p.sku ? <Text style={{ fontSize: 12, fontWeight: '700', color: colors.dark }}>{p.sku}</Text> : null}
              </View>
              {p.packNote ? <Text style={styles.muted}>{p.packNote}</Text> : null}
              <Text style={styles.muted}>
                {p.weighed ? 'Կշռվող · ' : ''}Նվազագույնը՝ {p.minQty} {p.unit}
                {p.step !== p.minQty ? `, քայլը՝ ${p.step}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                  {formatAmd(priceOf(p))} / {p.unit}
                </Text>
                {p.inStock ? (
                  <View style={stepper}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Պակասեցնել" onPress={() => setQty(p.id, decQty(p, qty))} style={stepBtn}>
                      <Text style={{ fontSize: 20 }}>−</Text>
                    </Pressable>
                    <Text style={{ minWidth: 64, textAlign: 'center', fontWeight: '600' }}>
                      {qty} {p.unit}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Ավելացնել"
                      onPress={() => setQty(p.id, incQty(p, qty))}
                      style={[stepBtn, { backgroundColor: colors.primary }]}>
                      <Text style={{ fontSize: 20, color: '#FFFFFF' }}>+</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pill text="Չկա" tone="warn" />
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={{ paddingBottom: 20 }}>
        <Button kind="dark" label={`Զամբյուղ · ${inCart} ապրանք →`} onPress={() => router.push('/shop/cart')} />
      </View>
    </Screen>
  );
}

const backBtn = {
  width: 44,
  height: 44,
  borderRadius: 22,
  borderWidth: 1,
  borderColor: colors.borderStrong,
  backgroundColor: colors.card,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

const stepper = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  backgroundColor: '#F2F1EC',
  borderRadius: radius.md,
  padding: 2,
} as const;

const stepBtn = {
  width: 40,
  height: 40,
  borderRadius: radius.sm,
  backgroundColor: colors.card,
  alignItems: 'center',
  justifyContent: 'center',
} as const;
