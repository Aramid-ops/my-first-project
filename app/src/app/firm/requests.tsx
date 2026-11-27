// «📣 Փնտրում են մատակարար». խանութների բաց հարցումները → մատակարարը ուղարկում է առաջարկ
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { formatAmd, formatDayTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Button, Chips, Field, Pill, Screen, styles, Title } from '@/lib/ui';

type Req = {
  id: string;
  text: string;
  category: string | null;
  price_hint: number | null;
  created_at: string;
  shop_name: string;
  district: string | null;
  phone: string | null;
  my_offer: string | null;
  mine_category: boolean;
};

export default function OpenRequests() {
  const { session, employees } = useStore();
  const [rows, setRows] = useState<Req[]>([]);
  const [only, setOnly] = useState<'mine' | 'all'>('mine');
  const [openId, setOpenId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('open_supply_requests');
    setRows((data ?? []) as Req[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (session?.kind !== 'employee') return <Redirect href="/" />;
  const me = employees.find((e) => e.id === session.employeeId);
  if (!me) return null;
  const list = only === 'mine' ? rows.filter((r) => r.mine_category) : rows;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub="Խանութները փնտրում են մատակարար">📣 Հարցումներ</Title>
      </View>
      <View style={{ marginBottom: 10 }}>
        <Chips options={[{ value: 'mine', label: 'Իմ ապրանքների համար' }, { value: 'all', label: 'Բոլորը' }]} value={only} onChange={(v) => setOnly(v as 'mine' | 'all')} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {list.length === 0 ? <Text style={styles.muted}>Բաց հարցումներ չկան</Text> : null}
        {list.map((r) => (
          <View key={r.id} style={[styles.card, { gap: 6 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={[styles.strong, { flex: 1 }]}>{r.text}</Text>
              <Text style={styles.muted}>{formatDayTime(r.created_at)}</Text>
            </View>
            <Text style={styles.body}>
              {r.shop_name}
              {r.district ? ` · ${r.district}` : ''}
            </Text>
            <Text style={styles.muted}>
              {r.category ?? ''}
              {r.price_hint ? ` · ցանկալի գինը՝ ${formatAmd(Number(r.price_hint))}` : ''}
            </Text>
            {r.phone ? (
              <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${r.phone}`)} hitSlop={8}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>📞 {r.phone}</Text>
              </Pressable>
            ) : null}
            {r.my_offer ? (
              <Pill text={`Ձեր առաջարկը ուղարկված է՝ «${r.my_offer.slice(0, 40)}»`} />
            ) : openId === r.id ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  importantForAutofill="no"
                  accessibilityLabel="Ձեր առաջարկը"
                  placeholder="Ձեր առաջարկը (օր.՝ Ունենք ձու C0, առաքում երեքշաբթի և ուրբաթ)"
                  value={text}
                  onChangeText={setText}
                  multiline
                  textAlignVertical="top"
                  style={{ minHeight: 80, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 12, fontSize: 15, backgroundColor: colors.card, color: colors.text }}
                />
                <Field label="Գին, ֏ (ըստ ցանկության)" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} keyboardType="number-pad" />
                {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
                <Button
                  label="Ուղարկել առաջարկ"
                  disabled={!text.trim()}
                  onPress={async () => {
                    const { error } = await supabase
                      .from('supply_offers')
                      .insert({ request_id: r.id, firm_id: me.firmId, employee_id: me.id, text: text.trim(), price: price ? Number(price) : null });
                    if (error) return setMsg(error.message);
                    setOpenId(null);
                    setText('');
                    setPrice('');
                    setMsg(null);
                    load();
                  }}
                />
              </View>
            ) : (
              <Button kind="outline" label="💼 Առաջարկել" onPress={() => { setOpenId(r.id); setText(''); setPrice(''); setMsg(null); }} />
            )}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
