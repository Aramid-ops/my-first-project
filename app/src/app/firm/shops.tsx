// Բոլոր խանութները (ռեստորաններ, սրճարաններ...)՝ մատակարարի համար. գտնել, զանգել, առաջարկել
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { districts } from '@/lib/districts';
import { matches } from '@/lib/search';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Chips, Pill, Screen, styles, Title } from '@/lib/ui';

type Row = { id: string; name: string; district: string | null; address: string | null; phone: string | null; contact_person: string | null; distance_km: number | null; is_client: boolean };
/** «Ով է գնում»՝ ծավալը միայն միջակայքով, առանց մատակարարի և գնի */
type Demand = Row & { qty_band: string; unit: string; last_band: string };

export default function AllShops() {
  const { session } = useStore();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('all');
  const [sort, setSort] = useState<'name' | 'near'>('name');
  const [showDistricts, setShowDistricts] = useState(false);
  const [product, setProduct] = useState('');
  const [demand, setDemand] = useState<Demand[] | null>(null);
  useEffect(() => {
    supabase.rpc('shop_directory').then(({ data }) => setRows((data ?? []) as Row[]));
  }, []);
  // «Ով է գնում ձու». փոքր դադարով
  useEffect(() => {
    const t = product.trim();
    if (t.length < 2) return setDemand(null);
    const timer = setTimeout(() => supabase.rpc('shop_demand', { q: t }).then(({ data }) => setDemand((data ?? []) as Demand[])), 300);
    return () => clearTimeout(timer);
  }, [product]);
  if (session?.kind !== 'employee') return <Redirect href="/" />;

  const list = ((demand ?? rows ?? []) as (Row & Partial<Demand>)[])
    .filter((r) => (district === 'all' || r.district === district) && matches(`${r.name} ${r.address ?? ''} ${r.contact_person ?? ''}`, q))
    .sort((a, b) => (sort === 'near' ? (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9) : demand ? 0 : a.name.localeCompare(b.name, 'hy')));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub={rows ? `${rows.length} խանութ, ռեստորան, սրճարան` : undefined}>Բոլոր խանութները</Title>
      </View>
      <TextInput
        importantForAutofill="no"
        value={product}
        onChangeText={setProduct}
        placeholder="🔎 Ով է գնում… (օր.՝ ձու, միս, ձեթ)"
        accessibilityLabel="Ով է գնում ապրանքը"
        autoCorrect={false}
        style={{ minHeight: 46, borderWidth: 1, borderColor: colors.dark, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 15, backgroundColor: colors.card, color: colors.text, marginBottom: 8 }}
      />
      {demand ? (
        <Text style={[styles.muted, { marginBottom: 8 }]}>
          {demand.length} կետ գնում է «{product.trim()}» (վերջին 3 ամիս, հավելվածի պատվերներով)։ Ծավալը՝ մոտավոր, ամսական։
        </Text>
      ) : null}
      <TextInput
        importantForAutofill="no"
        value={q}
        onChangeText={setQ}
        placeholder="Որոնել անունով կամ հասցեով"
        accessibilityLabel="Որոնել խանութ"
        autoCorrect={false}
        style={{ minHeight: 46, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 15, backgroundColor: colors.card, color: colors.text, marginBottom: 8 }}
      />
      <View style={{ gap: 8, marginBottom: 10 }}>
        <Chips options={[{ value: 'name', label: 'Ըստ անվան' }, { value: 'near', label: '📍 Մոտիկից' }]} value={sort} onChange={(v) => setSort(v as 'name' | 'near')} />
        <Pressable accessibilityRole="button" onPress={() => setShowDistricts(!showDistricts)} hitSlop={8}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Թաղամաս՝ {district === 'all' ? 'բոլորը' : district} {showDistricts ? '▴' : '▾'}</Text>
        </Pressable>
        {showDistricts ? (
          <Chips
            options={[{ value: 'all', label: 'Բոլորը' }, ...districts.map((d) => ({ value: d, label: d }))]}
            value={district}
            onChange={(v) => {
              setDistrict(v);
              setShowDistricts(false);
            }}
          />
        ) : null}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {rows && list.length === 0 ? <Text style={styles.muted}>Ոչինչ չգտնվեց</Text> : null}
        {list.map((r) => (
          <View key={r.id} style={[styles.card, { gap: 4 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={[styles.strong, { flex: 1 }]}>{r.name}</Text>
              {r.is_client ? <Pill text="Ձեր հաճախորդն է" /> : null}
            </View>
            <Text style={styles.muted}>
              {[r.district, r.address].filter(Boolean).join(', ')}
              {r.distance_km != null ? ` · 📍 ${r.distance_km} կմ` : ''}
            </Text>
            {r.qty_band ? (
              <Text style={{ color: colors.dark, fontWeight: '600' }}>
                Գնում է ≈ {r.qty_band} {r.unit}/ամիս · վերջինը՝ {r.last_band}
              </Text>
            ) : null}
            {r.contact_person ? <Text style={styles.body}>{r.contact_person}</Text> : null}
            {r.phone ? (
              <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${r.phone}`)} hitSlop={8}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>📞 {r.phone}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
