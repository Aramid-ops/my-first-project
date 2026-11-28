// Բոլոր մատակարարները՝ քառակուսիներով, ըստ ոլորտի. սեղմելով՝ ֆիրմայի էջը (տվյալներ, տեսականի, «Միանալ»)
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { startsWithWord } from '@/lib/search';
import { supabase } from '@/lib/supabase';
import { radius } from '@/lib/theme';

import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Chips, Logo, Screen, styles, Title } from '@/lib/ui';

export default function AllSuppliers() {
  const { session, firms, links } = useStore();
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  // ապրանքով որոնում. ով ունի «ձու» (firm_id → քանի ապրանք)
  const [byProduct, setByProduct] = useState<Record<string, number>>({});
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return setByProduct({});
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('market_search', { q: text, p_sort: 'best', max_rows: 100 });
      const counts: Record<string, number> = {};
      for (const h of (data ?? []) as { firm_id: string }[]) counts[h.firm_id] = (counts[h.firm_id] ?? 0) + 1;
      setByProduct(counts);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const statusOf = (firmId: string) => links.find((l) => l.shopId === session.shopId && l.firmId === firmId)?.status;
  // Վճարողները՝ առաջինը, հետո այբբենական կարգով
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...firms].sort(
    (a, b) => Number(!!b.featuredUntil && b.featuredUntil >= today) - Number(!!a.featuredUntil && a.featuredUntil >= today) || a.name.localeCompare(b.name, 'hy'),
  );
  // ոլորտները՝ ֆիրմայի նշած կատեգորիաներից (կամ հին տեքստային «category»-ից)
  const catsOf = (f: (typeof firms)[number]) => (f.categories?.length ? f.categories : [f.category.trim()].filter(Boolean));
  const cats = [...new Set(firms.flatMap(catsOf))].sort((a, b) => a.localeCompare(b, 'hy'));
  const list = (cat === 'all' ? sorted : sorted.filter((f) => catsOf(f).includes(cat))).filter(
    (f) => !q.trim() || startsWithWord(`${f.name} ${f.category}`, q) || byProduct[f.id],
  );

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub={`${firms.length} մատակարար`}>Բոլոր մատակարարները</Title>
      </View>
      <TextInput
        placeholderTextColor={colors.textMuted}
        importantForAutofill="no"
        value={q}
        onChangeText={setQ}
        placeholder="🔍 Մատակարար կամ ապրանք (օր.՝ ձու)"
        accessibilityLabel="Որոնել մատակարար կամ ապրանք"
        autoCorrect={false}
        style={{ minHeight: 48, borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 15, backgroundColor: colors.card, color: colors.text, marginBottom: 10 }}
      />
      {cats.length > 1 ? (
        <View style={{ marginBottom: 10 }}>
          <Chips options={[{ value: 'all', label: 'Բոլորը' }, ...cats.map((c) => ({ value: c, label: c }))]} value={cat} onChange={setCat} />
        </View>
      ) : null}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 24 }}>
        {list.length === 0 ? <Text style={styles.muted}>Ոչինչ չգտնվեց</Text> : null}
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
              {q.trim() && byProduct[f.id] ? <Text style={{ fontSize: 13, color: colors.text }}>🔎 {byProduct[f.id]} ապրանք՝ «{q.trim()}»</Text> : null}
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
