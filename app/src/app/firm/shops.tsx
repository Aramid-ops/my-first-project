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

export default function AllShops() {
  const { session } = useStore();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('all');
  const [sort, setSort] = useState<'name' | 'near'>('name');
  const [showDistricts, setShowDistricts] = useState(false);
  useEffect(() => {
    supabase.rpc('shop_directory').then(({ data }) => setRows((data ?? []) as Row[]));
  }, []);
  if (session?.kind !== 'employee') return <Redirect href="/" />;

  const list = (rows ?? [])
    .filter((r) => (district === 'all' || r.district === district) && matches(`${r.name} ${r.address ?? ''} ${r.contact_person ?? ''}`, q))
    .sort((a, b) => (sort === 'near' ? (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9) : a.name.localeCompare(b.name, 'hy')));

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
