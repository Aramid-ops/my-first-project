// Հարթակի ադմին («Մատակարար»-ի թիմ). վարորդների նույնականացում և ֆիրմաների հայտեր
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Button, Chips, CopyRow, Screen, styles, Title } from '@/lib/ui';

type Ver = { user_id: string; name: string; phone: string | null; license_categories: string[]; front: string; back: string; selfie: string; document_type: string; urls?: string[] };
type Claim = { id: string; firm_name: string; data: Record<string, string>; email: string };

export default function Platform() {
  const { signOut } = useStore();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'drivers' | 'firms'>('drivers');
  const [vers, setVers] = useState<Ver[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data: me } = await supabase.from('platform_admins').select('user_id').maybeSingle();
    setAllowed(!!me);
    if (!me) return;
    const [{ data: v }, { data: c }] = await Promise.all([supabase.rpc('pending_verifications'), supabase.rpc('pending_claims')]);
    const withUrls = await Promise.all(
      ((v ?? []) as Ver[]).map(async (x) => {
        const { data } = await supabase.storage.from('kyc').createSignedUrls([x.front, x.back, x.selfie], 600);
        return { ...x, urls: (data ?? []).map((d) => d.signedUrl ?? "").filter(Boolean) };
      }),
    );
    setVers(withUrls);
    setClaims((c ?? []) as Claim[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (allowed === false) return <Redirect href="/" />;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.dark }}>Մատակարար · հարթակ</Text>
        <Pressable accessibilityRole="button" onPress={() => { signOut(); router.replace('/'); }} hitSlop={12}>
          <Text style={styles.muted}>Դուրս գալ</Text>
        </Pressable>
      </View>
      <Title>Ստուգումներ</Title>
      <View style={{ marginBottom: 12 }}>
        <Chips
          options={[
            { value: 'drivers', label: 'Վարորդներ', hint: `${vers.length}` },
            { value: 'firms', label: 'Ֆիրմաներ', hint: `${claims.length}` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        {tab === 'drivers' && vers.length === 0 ? <Text style={styles.muted}>Ստուգման սպասող վարորդ չկա</Text> : null}
        {tab === 'drivers'
          ? vers.map((v) => (
              <View key={v.user_id} style={[styles.card, { gap: 8 }]}>
                <Text style={[styles.strong, { fontSize: 18 }]}>{v.name}</Text>
                <CopyRow label="Հեռախոս" value={v.phone} />
                <Text style={styles.muted}>Կարգեր՝ {v.license_categories.join(', ')} · {v.document_type === 'id_card' ? 'ID քարտ' : 'անձնագիր'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(v.urls ?? []).map((u, i) => (
                    <Image key={i} source={{ uri: u }} style={{ width: 150, height: 110, borderRadius: radius.sm }} contentFit="cover" accessibilityLabel={['Իրավունք առջև', 'Իրավունք հետև', 'Սելֆի անձնագրով'][i]} />
                  ))}
                </View>
                <TextInput
                  accessibilityLabel="Մերժման պատճառ"
                  placeholder="Մերժման պատճառ (եթե մերժում եք)"
                  value={note[v.user_id] ?? ''}
                  onChangeText={(t) => setNote({ ...note, [v.user_id]: t })}
                  style={{ minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: 10, backgroundColor: colors.card, color: colors.text }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button kind="outline" label="Մերժել" onPress={async () => { await supabase.rpc('decide_driver_verification', { p_user: v.user_id, p_approve: false, p_note: note[v.user_id] || null }); load(); }} style={{ flex: 1 }} />
                  <Button label="Հաստատել ✓" onPress={async () => { await supabase.rpc('decide_driver_verification', { p_user: v.user_id, p_approve: true }); load(); }} style={{ flex: 1 }} />
                </View>
              </View>
            ))
          : null}
        {tab === 'firms' && claims.length === 0 ? <Text style={styles.muted}>Ֆիրմայի հայտ չկա</Text> : null}
        {tab === 'firms'
          ? claims.map((c) => (
              <View key={c.id} style={[styles.card, { gap: 6 }]}>
                <Text style={styles.muted}>Ուզում է «վերցնել» ֆիրման</Text>
                <Text style={[styles.strong, { fontSize: 18 }]}>{c.firm_name}</Text>
                <CopyRow label="Անվանում" value={c.data.legal_name} />
                <CopyRow label="ՀՎՀՀ" value={c.data.tax_id} />
                <CopyRow label="Անուն" value={c.data.name} />
                <CopyRow label="Հեռախոս" value={c.data.phone} />
                <CopyRow label="Էլ. փոստ" value={c.email} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button kind="outline" label="Մերժել" onPress={async () => { await supabase.rpc('decide_firm_claim', { p_claim: c.id, p_approve: false }); load(); }} style={{ flex: 1 }} />
                  <Button label="Հաստատել ✓" onPress={async () => { await supabase.rpc('decide_firm_claim', { p_claim: c.id, p_approve: true }); load(); }} style={{ flex: 1 }} />
                </View>
              </View>
            ))
          : null}
      </ScrollView>
    </Screen>
  );
}
