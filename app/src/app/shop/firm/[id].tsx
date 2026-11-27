// Մատակարարի էջ (դեռ միացած չեմ). տվյալներ, տեսականի (առանց գների) և «Միանալ» հայտ
import { Image } from 'expo-image';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { formatAmd } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Button, Card, Logo, Pill, Screen, styles } from '@/lib/ui';

type Item = { id: string; sku: string | null; name: string; image_url: string | null; unit: string; pack_note: string | null; in_stock: boolean };

export default function FirmProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, firms, links, requestJoin } = useStore();
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    supabase.rpc('firm_assortment', { p_firm: id }).then(({ data }) => setItems((data ?? []) as Item[]));
  }, [id]);
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const f = firms.find((x) => x.id === id);
  if (!f) return null;
  const st = links.find((l) => l.shopId === session.shopId && l.firmId === f.id)?.status;
  if (st === 'active') return <Redirect href={`/shop/supplier/${f.id}`} />;

  const rows: [string, string | undefined][] = [
    ['Իրավաբանական անվանում', f.legalName],
    ['ՀՎՀՀ', f.taxId],
    ['Հասցե', f.address],
    ['Նվազագույն պատվեր', f.minOrderAmount ? formatAmd(f.minOrderAmount) : undefined],
  ];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Logo name={f.name} uri={f.logoUrl} bg={f.color.bg} fg={f.color.fg} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.strong, { fontSize: 19 }]}>{f.name}</Text>
          {f.category ? <Text style={styles.muted}>{f.category}</Text> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        {f.description ? <Text style={styles.body}>{f.description}</Text> : null}
        <Card style={{ gap: 8 }}>
          {rows.map(([k, v]) =>
            v ? (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text style={styles.muted}>{k}</Text>
                <Text style={[styles.body, { flexShrink: 1, textAlign: 'right' }]}>{v}</Text>
              </View>
            ) : null,
          )}
          {f.phone ? (
            <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${f.phone}`)} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.muted}>Հեռախոս</Text>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>📞 {f.phone}</Text>
            </Pressable>
          ) : null}
          {rows.every(([, v]) => !v) && !f.phone ? <Text style={styles.muted}>Մատակարարը դեռ չի լրացրել իր տվյալները</Text> : null}
        </Card>

        {st === 'pending' ? (
          <Pill text="Հայտը ուղարկված է. մենեջերը կկապվի ձեզ հետ" tone="info" />
        ) : (
          <Button
            label={busy ? 'Ուղարկվում է…' : 'Միանալ որպես հաճախորդ'}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              setMsg(await requestJoin(f.id));
              setBusy(false);
            }}
          />
        )}
        {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
        <Text style={styles.muted}>Հայտի հետ մատակարարը կտեսնի ձեր խանութի տվյալները (անվանում, ՀՎՀՀ, հասցե, հեռախոս)։ Գները կտեսնեք միանալուց հետո։</Text>

        <Text style={[styles.strong, { marginTop: 4 }]}>Տեսականի{items ? ` · ${items.length}` : ''}</Text>
        {items?.length === 0 ? <Text style={styles.muted}>Ապրանքներ դեռ չկան</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {(items ?? []).map((p) => (
            <View key={p.id} style={[styles.card, { width: '47%', flexGrow: 1, gap: 6, opacity: p.in_stock ? 1 : 0.55 }]}>
              {p.image_url ? (
                <Image source={{ uri: p.image_url }} style={{ width: '100%', height: 90, borderRadius: radius.sm }} contentFit="cover" accessibilityLabel={p.name} />
              ) : null}
              <Text style={styles.body} numberOfLines={3}>{p.name}</Text>
              <Text style={styles.muted}>
                {p.unit}
                {p.pack_note ? ` · ${p.pack_note}` : ''}
                {p.in_stock ? '' : ' · Չկա'}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
