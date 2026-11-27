// Որոնում. հայերեն / ռուսերեն / լատինատառ, 1–3 տառից, ինչպես նաև արտիկուլով (օր.՝ AT0012)
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { formatAmd } from '@/lib/rules';
import { startsWithWord } from '@/lib/search';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Button, Logo, Pill, Screen, styles } from '@/lib/ui';

type Hit = {
  product_id: string;
  firm_id: string;
  sku: string | null;
  name: string;
  unit: string;
  price: number;
  in_stock: boolean;
  firm_name: string;
};

export default function Search() {
  const { session, firms, links, employees, requestJoin } = useStore();
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  // Ապրանքներ՝ բազայից (փոքր դադարով, որ ամեն տառի վրա չծանրաբեռնենք)
  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setHits([]);
      return;
    }
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_products', { q: text, max_rows: 30 });
      if (my === seq.current) {
        setHits((data ?? []) as Hit[]);
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  if (session?.kind !== 'shop') return <Redirect href="/" />;

  const linkFor = (firmId: string) => links.find((l) => l.shopId === session.shopId && l.firmId === firmId);
  // Մատակարարներ՝ միանգամից, հեռախոսում (կատալոգը բոլորին հասանելի է)
  const firmHits = q.trim() ? firms.filter((f) => startsWithWord(`${f.name} ${f.category}`, q)) : [];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <TextInput importantForAutofill="no"
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="Ապրանք, մատակարար կամ արտիկուլ"
          accessibilityLabel="Որոնում"
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            flex: 1,
            minHeight: 48,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            fontSize: 16,
            backgroundColor: colors.card,
            color: colors.text,
          }}
        />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
        {!q.trim() ? (
          <Text style={styles.muted}>Կարող եք գրել հայերեն, ռուսերեն կամ լատինատառ, օր.՝ «կաթ», «кат», «kat», կամ արտիկուլ՝ «KT0002»</Text>
        ) : null}

        {joinMsg ? <Text style={{ color: colors.warnText }}>{joinMsg}</Text> : null}
        {firmHits.length > 0 ? <Text style={[styles.strong, { fontSize: 14, color: colors.textMuted }]}>Մատակարարներ</Text> : null}
        {firmHits.map((f) => {
          const link = linkFor(f.id);
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              onPress={() => (link?.status === 'active' ? router.push(`/shop/supplier/${f.id}`) : undefined)}
              style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <Logo name={f.name} uri={f.logoUrl} bg={f.color.bg} fg={f.color.fg} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{f.name}</Text>
                <Text style={styles.muted}>{f.category}</Text>
              </View>
              {link?.status === 'active' ? (
                <Pill text="Իմ մատակարարը" />
              ) : link?.status === 'pending' ? (
                <Pill text="Հայտը ուղարկված է" tone="info" />
              ) : (
                <Button label="Միանալ" onPress={async () => setJoinMsg(await requestJoin(f.id))} style={{ minHeight: 40 }} />
              )}
            </Pressable>
          );
        })}

        {hits.length > 0 ? <Text style={[styles.strong, { fontSize: 14, color: colors.textMuted, marginTop: 6 }]}>Ապրանքներ</Text> : null}
        {hits.map((h) => {
          const link = linkFor(h.firm_id);
          const manager = employees.find((e) => e.id === link?.managerId);
          return (
            <Pressable
              key={h.product_id}
              accessibilityRole="button"
              onPress={() => router.push(`/shop/supplier/${h.firm_id}`)}
              style={[styles.card, { gap: 4, opacity: h.in_stock ? 1 : 0.55 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={[styles.strong, { flex: 1 }]}>{h.name}</Text>
                {h.sku ? <Text style={{ fontSize: 12, fontWeight: '700', color: colors.dark }}>{h.sku}</Text> : null}
              </View>
              <Text style={styles.muted}>
                {h.firm_name}
                {manager ? ` · մենեջեր՝ ${manager.name}` : ''}
              </Text>
              <Text style={styles.body}>
                {formatAmd(Number(h.price))} / {h.unit}
                {h.in_stock ? '' : ' · Չկա'}
              </Text>
            </Pressable>
          );
        })}

        {q.trim() && !loading && hits.length === 0 && firmHits.length === 0 ? <Text style={styles.muted}>Ոչինչ չգտնվեց</Text> : null}
      </ScrollView>
    </Screen>
  );
}
