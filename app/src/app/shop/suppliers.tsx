// Բոլոր մատակարարները՝ քառակուսիներով, ըստ ոլորտի. սեղմելով՝ ֆիրմայի էջը (տվյալներ, տեսականի, «Միանալ»)
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Chips, Logo, Screen, styles, Title } from '@/lib/ui';

export default function AllSuppliers() {
  const { session, firms, links } = useStore();
  const [cat, setCat] = useState<string>('all');
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const statusOf = (firmId: string) => links.find((l) => l.shopId === session.shopId && l.firmId === firmId)?.status;
  // Վճարողները՝ առաջինը, հետո այբբենական կարգով
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...firms].sort(
    (a, b) => Number(!!b.featuredUntil && b.featuredUntil >= today) - Number(!!a.featuredUntil && a.featuredUntil >= today) || a.name.localeCompare(b.name, 'hy'),
  );
  const cats = [...new Set(firms.map((f) => f.category.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hy'));
  const list = cat === 'all' ? sorted : sorted.filter((f) => f.category.trim() === cat);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub={`${firms.length} մատակարար`}>Բոլոր մատակարարները</Title>
      </View>
      {cats.length > 1 ? (
        <View style={{ marginBottom: 10 }}>
          <Chips options={[{ value: 'all', label: 'Բոլորը' }, ...cats.map((c) => ({ value: c, label: c }))]} value={cat} onChange={setCat} />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 24 }}>
        {list.map((f) => {
          const st = statusOf(f.id);
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              onPress={() => router.push(st === 'active' ? `/shop/supplier/${f.id}` : `/shop/firm/${f.id}`)}
              style={({ pressed }) => [styles.card, { width: '47%', flexGrow: 1, gap: 8, opacity: pressed ? 0.8 : 1 }]}>
              <Logo name={f.name} uri={f.logoUrl} bg={f.color.bg} fg={f.color.fg} size={56} />
              <Text style={styles.strong} numberOfLines={2}>{f.name}</Text>
              <Text style={styles.muted} numberOfLines={2}>{f.category || ' '}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: st === 'active' ? colors.primary : colors.infoText }}>
                {st === 'active' ? 'Իմ մատակարարը →' : st === 'pending' ? 'Հայտը ուղարկված է' : 'Դիտել →'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
