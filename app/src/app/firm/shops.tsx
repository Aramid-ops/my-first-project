// Բոլոր խանութները (ռեստորաններ, սրճարաններ...)՝ մատակարարի համար. գտնել, զանգել, առաջարկել
import { Redirect, router } from 'expo-router';
import { placeLine } from '@/lib/rules';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { districts } from '@/lib/districts';
import { matches } from '@/lib/search';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Button, Chips, Pill, Screen, styles, Title } from '@/lib/ui';

type Row = { id: string; name: string; district: string | null; address: string | null; phone: string | null; contact_person: string | null; distance_km: number | null; is_client: boolean };
/** «Ով է գնում»՝ ծավալը միայն միջակայքով, առանց մատակարարի և գնի */
type Demand = Row & { qty_band: string | null; unit: string | null; last_band: string | null; price_status: 'none' | 'mine' | 'cheaper' | 'pricier' | 'same' | null };
// Համեմատությունը՝ ձեր գնի հետ (ուրիշի գինը չի երևում)
const statusLabel = {
  none: { text: '🔴 Չի գնում', color: '#9B2C2C' },
  cheaper: { text: '🟢 Գնում է ձեր գնից էժան', color: '#2F5A2A' },
  pricier: { text: '🟡 Գնում է ձեր գնից թանկ. արժի առաջարկել', color: '#7A5214' },
  same: { text: '⚪ Գնում է մոտավորապես ձեր գնով', color: '#5B6470' },
  mine: { text: '✓ Գնում է ձեզանից', color: '#1F5E4E' },
};

export default function AllShops() {
  const { session, perms, offerPartnership, links, categories } = useStore();
  const [sent, setSent] = useState<Record<string, string>>({});
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
      <TextInput placeholderTextColor={colors.textMuted}
        importantForAutofill="no"
        value={product}
        onChangeText={setProduct}
        placeholder="🔎 Ով է գնում… (օր.՝ ձու, միս, ձեթ)"
        accessibilityLabel="Ով է գնում ապրանքը"
        autoCorrect={false}
        style={{ minHeight: 46, borderWidth: 1, borderColor: colors.dark, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 15, backgroundColor: colors.card, color: colors.text, marginBottom: 8 }}
      />
      {!product.trim() ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, minHeight: 48, marginBottom: 8 }} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingVertical: 2 }}>
          {categories.filter((c) => c !== 'Այլ').map((c) => (
            <Pressable key={c} accessibilityRole="button" onPress={() => setProduct(c)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card }}>
              <Text style={styles.body}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {demand ? (
        <Text style={[styles.muted, { marginBottom: 8 }]}>
          {demand.filter((d) => d.qty_band).length} կետ գնում է «{product.trim()}», {demand.filter((d) => d.price_status === 'none').length}-ը՝ ոչ (վերջին 3 ամիս, հավելվածի պատվերներով)։ Ծավալը՝ մոտավոր, ամսական։
        </Text>
      ) : null}
      <TextInput placeholderTextColor={colors.textMuted}
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
              {placeLine(r.district, r.address)}
              {r.distance_km != null ? ` · 📍 ${r.distance_km} կմ` : ''}
            </Text>
            {r.price_status && statusLabel[r.price_status] ? (
              <Text style={{ color: statusLabel[r.price_status].color, fontWeight: '600' }}>{statusLabel[r.price_status].text}</Text>
            ) : null}
            {r.qty_band ? (
              <Text style={styles.body}>
                ≈ {r.qty_band} {r.unit}/ամիս · վերջինը՝ {r.last_band}
              </Text>
            ) : null}
            {r.contact_person ? <Text style={styles.body}>{r.contact_person}</Text> : null}
            {r.phone ? (
              <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${r.phone}`)} hitSlop={8}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>📞 {r.phone}</Text>
              </Pressable>
            ) : null}
            {!r.is_client && perms.includes('shops_new') ? (
              links.some((l) => l.shopId === r.id) || sent[r.id] ? (
                <Text style={styles.muted}>{sent[r.id] ?? 'Առաջարկը / հայտը սպասում է'}</Text>
              ) : (
                <Button
                  kind="outline"
                  label="🤝 Առաջարկել համագործակցություն"
                  onPress={async () => setSent({ ...sent, [r.id]: (await offerPartnership(r.id)) ?? '✓ Առաջարկը ուղարկված է' })}
                />
              )
            ) : null}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
