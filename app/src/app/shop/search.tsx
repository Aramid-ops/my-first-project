// Որոնում բոլոր մատակարարների մոտ. հայերեն / ռուսերեն / լատինատառ կամ արտիկուլ (օր.՝ AT0012)
// Դասավորել՝ համապատասխան / էժանից / թանկից / մոտիկից / շատ վաճառվող
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { formatAmd } from '@/lib/rules';
import { startsWithWord } from '@/lib/search';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Chips, Logo, Pill, Screen, styles } from '@/lib/ui';

type Sort = 'best' | 'cheap' | 'expensive' | 'near' | 'popular';
const sorts: { value: Sort; label: string }[] = [
  { value: 'best', label: 'Համապատասխան' },
  { value: 'cheap', label: 'Էժանից' },
  { value: 'expensive', label: 'Թանկից' },
  { value: 'near', label: '📍 Մոտիկից' },
  { value: 'popular', label: '🔥 Շատ վաճառվող' },
];

type Hit = {
  product_id: string;
  firm_id: string;
  firm_name: string;
  sku: string | null;
  name: string;
  unit: string;
  pack_note: string | null;
  price: number;
  in_stock: boolean;
  sold: number;
  link_status: 'active' | 'pending' | null;
  manager_name: string | null;
  manager_phone: string | null;
  serves_district: boolean;
  distance_km: number | null;
};

export default function Search() {
  const { session, firms, links, shops, requestJoin } = useStore();
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('best');
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
      const { data } = await supabase.rpc('market_search', { q: text, p_sort: sort, max_rows: 40 });
      if (my === seq.current) {
        setHits((data ?? []) as Hit[]);
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, sort]);

  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const shop = shops.find((s) => s.id === session.shopId);
  const linkFor = (firmId: string) => links.find((l) => l.shopId === session.shopId && l.firmId === firmId);
  const firmHits = q.trim() ? firms.filter((f) => startsWithWord(`${f.name} ${f.category}`, q)) : [];
  // Շուկայի գները՝ նույն միավորի առկա ապրանքների համար (առաջին արդյունքի միավորով)
  const same = hits.filter((h) => h.in_stock && h.unit === hits[0]?.unit).map((h) => Number(h.price));
  const market = same.length >= 2 ? { min: Math.min(...same), max: Math.max(...same), avg: Math.round(same.reduce((a, b) => a + b, 0) / same.length) } : null;
  const open = (firmId: string) => router.push(linkFor(firmId)?.status === 'active' ? `/shop/supplier/${firmId}` : `/shop/firm/${firmId}`);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <TextInput
          importantForAutofill="no"
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="Ի՞նչ եք փնտրում (օր.՝ ձու)"
          accessibilityLabel="Որոնում"
          autoCorrect={false}
          autoCapitalize="none"
          style={{ flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16, backgroundColor: colors.card, color: colors.text }}
        />
      </View>
      <View style={{ marginBottom: 10 }}>
        <Chips options={sorts} value={sort} onChange={setSort} />
      </View>
      {sort === 'near' && shop && shop.lat == null ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/shop/profile')} style={{ marginBottom: 8 }}>
          <Text style={{ color: colors.warnText }}>📍 Նշեք ձեր տեղը «Իմ տվյալները»-ում, որ ճիշտ հաշվենք հեռավորությունը →</Text>
        </Pressable>
      ) : null}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
        {!q.trim() ? (
          <Text style={styles.muted}>Գրեք ապրանքը, և կտեսնեք բոլոր մատակարարներին, ովքեր ունեն այն։ Կարող եք գրել հայերեն, ռուսերեն, լատինատառ կամ արտիկուլ։</Text>
        ) : null}

        {firmHits.length > 0 ? <Text style={[styles.strong, { fontSize: 14, color: colors.textMuted }]}>Մատակարարներ</Text> : null}
        {firmHits.map((f) => {
          const st = linkFor(f.id)?.status;
          return (
            <Pressable key={f.id} accessibilityRole="button" onPress={() => open(f.id)} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <Logo name={f.name} uri={f.logoUrl} bg={f.color.bg} fg={f.color.fg} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{f.name}</Text>
                <Text style={styles.muted}>{f.category}</Text>
              </View>
              {st === 'active' ? <Pill text="Իմ մատակարարը" /> : st === 'pending' ? <Pill text="Հայտը ուղարկված է" tone="info" /> : <Text style={{ color: colors.primary }}>Դիտել →</Text>}
            </Pressable>
          );
        })}

        {hits.length > 0 ? <Text style={[styles.strong, { fontSize: 14, color: colors.textMuted, marginTop: 6 }]}>Ապրանքներ · {hits.length}</Text> : null}
        {market ? (
          <View style={[styles.card, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, gap: 2 }]}>
            <Text style={styles.strong}>Շուկայի գինը՝ {formatAmd(market.min)} – {formatAmd(market.max)} / {hits[0].unit}</Text>
            <Text style={styles.body}>Միջինը՝ {formatAmd(market.avg)}</Text>
          </View>
        ) : null}
        {joinMsg ? <Text style={{ color: colors.warnText }}>{joinMsg}</Text> : null}
        {hits.map((h) => (
          <Pressable key={h.product_id} accessibilityRole="button" onPress={() => open(h.firm_id)} style={[styles.card, { gap: 4, opacity: h.in_stock ? 1 : 0.55 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={[styles.strong, { flex: 1 }]}>{h.name}</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{formatAmd(Number(h.price))}</Text>
            </View>
            <Text style={styles.muted}>
              {h.unit}
              {h.pack_note ? ` · ${h.pack_note}` : ''}
              {h.sku ? ` · ${h.sku}` : ''}
              {h.in_stock ? '' : ' · Չկա'}
            </Text>
            <Text style={styles.body}>
              {h.firm_name}
              {h.manager_name ? ` · մենեջեր՝ ${h.manager_name}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {linkFor(h.firm_id)?.status === 'active' ? <Pill text="Իմ մատակարարը · իմ գինը" /> : linkFor(h.firm_id)?.status === 'pending' ? <Pill text="Հայտը ուղարկված է" tone="info" /> : null}
              {h.serves_district && shop?.district ? <Pill text={`Աշխատում է ${shop.district}-ում`} tone="info" /> : null}
              {h.distance_km != null ? <Text style={styles.muted}>📍 {h.distance_km} կմ</Text> : null}
              {Number(h.sold) > 0 ? <Text style={styles.muted}>🔥 {Number(h.sold)} վաճառված</Text> : null}
              {market && h.in_stock && h.unit === hits[0].unit && Number(h.price) < market.avg ? <Pill text={`Միջինից ${Math.round((1 - Number(h.price) / market.avg) * 100)}% էժան`} /> : null}
              {linkFor(h.firm_id)?.status !== 'active' && h.manager_phone ? (
                <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${h.manager_phone}`)} hitSlop={8}>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>📞 Զանգել</Text>
                </Pressable>
              ) : null}
            </View>
            {!linkFor(h.firm_id) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={[styles.muted, { flex: 1 }]}>Ուղարկեք հայտ. գուցե ձեզ համար գինը ավելի մատչելի լինի</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={async () => setJoinMsg(await requestJoin(h.firm_id))}
                  style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.primary }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Ուղարկել հայտ</Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        ))}

        {q.trim() && !loading && hits.length === 0 && firmHits.length === 0 ? <Text style={styles.muted}>Ոչինչ չգտնվեց</Text> : null}
        {q.trim() && !loading ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/market')} style={[styles.card, { marginTop: 4 }]}>
            <Text style={styles.strong}>📣 Չգտա՞ք հարմարը</Text>
            <Text style={styles.muted}>Գրեք «Փնտրում եմ {q.trim()}», և մատակարարները կուղարկեն առաջարկ →</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
