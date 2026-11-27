// «📣 Փնտրում եմ մատակարար». խանութը գրում է ինչ է պետք (գինը՝ ըստ ցանկության), մատակարարները առաջարկ են ուղարկում
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { formatAmd, formatDayTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { channelName, supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Button, Card, Field, Pill, Screen, styles, Title } from '@/lib/ui';

type Offer = { id: string; firm_id: string; text: string; price: number | null; created_at: string };
type Req = { id: string; text: string; category: string | null; price_hint: number | null; status: 'open' | 'closed'; created_at: string; supply_offers: Offer[] };

export default function SupplyRequests() {
  const { session, firms, links } = useStore();
  const [list, setList] = useState<Req[]>([]);
  const [text, setText] = useState('');
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('supply_requests').select('*, supply_offers(*)').order('created_at', { ascending: false });
    setList((data ?? []) as Req[]);
  }, []);
  useEffect(() => {
    load();
    const ch = supabase.channel(channelName('my-supply-offers')).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'supply_offers' }, load).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const shopId = session.shopId;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub="Մատակարարները կտեսնեն և կուղարկեն առաջարկ">Փնտրում եմ մատակարար</Title>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        <Card style={{ gap: 10 }}>
          <TextInput
            importantForAutofill="no"
            accessibilityLabel="Ինչ է պետք"
            placeholder={'Ինչ է պետք (գրեք կամ թելադրեք 🎤)\nօր.՝ Ձու C0, շաբաթական 300 հատ'}
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 90, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 12, fontSize: 15, backgroundColor: colors.card, color: colors.text }}
          />
          <Field label="Ցանկալի գինը, ֏ (ըստ ցանկության)" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} keyboardType="number-pad" />
          {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
          <Button
            label="📣 Հրապարակել"
            disabled={text.trim().length < 2}
            onPress={async () => {
              const { error } = await supabase.from('supply_requests').insert({ shop_id: shopId, text: text.trim(), price_hint: price ? Number(price) : null });
              if (error) return setMsg(error.message);
              setText('');
              setPrice('');
              setMsg(null);
              load();
            }}
          />
        </Card>

        {list.map((r) => (
          <Card key={r.id} style={{ gap: 8, opacity: r.status === 'open' ? 1 : 0.6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={[styles.strong, { flex: 1 }]}>{r.text}</Text>
              <Text style={styles.muted}>{formatDayTime(r.created_at)}</Text>
            </View>
            <Text style={styles.muted}>
              {r.category ?? ''}
              {r.price_hint ? ` · ցանկալի գինը՝ ${formatAmd(Number(r.price_hint))}` : ''}
            </Text>
            <Pill text={r.status === 'closed' ? 'Փակված է' : r.supply_offers.length ? `${r.supply_offers.length} առաջարկ` : 'Սպասում է առաջարկների'} tone={r.supply_offers.length ? 'ok' : 'info'} />
            {r.supply_offers.map((o) => {
              const f = firms.find((x) => x.id === o.firm_id);
              const linked = links.find((l) => l.shopId === shopId && l.firmId === o.firm_id)?.status === 'active';
              return (
                <Pressable
                  key={o.id}
                  accessibilityRole="button"
                  onPress={() => router.push(linked ? `/shop/supplier/${o.firm_id}` : `/shop/firm/${o.firm_id}`)}
                  style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={styles.strong}>💼 {f?.name ?? 'Մատակարար'}</Text>
                    {o.price ? <Text style={styles.strong}>{formatAmd(Number(o.price))}</Text> : null}
                  </View>
                  <Text style={styles.body}>{o.text}</Text>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>{linked ? 'Պատվիրել →' : 'Դիտել և միանալ →'}</Text>
                </Pressable>
              );
            })}
            {r.status === 'open' ? (
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  await supabase.from('supply_requests').update({ status: 'closed' }).eq('id', r.id);
                  load();
                }}
                hitSlop={8}>
                <Text style={{ color: colors.textMuted }}>Փակել (այլևս պետք չէ)</Text>
              </Pressable>
            ) : null}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
