// 🟢 Live շուկա. երկու պատուհան, որ թարմանում են ակնթարթորեն
//   🛒 Խանութները ուզում են   — խանութը գրում է ինչ է պետք → մատակարարը «Առաջարկել»
//   💼 Մատակարարները առաջարկում են — մատակարարը գրում է առաջարկը → խանութը «Հետաքրքրված եմ»
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { formatAmd, formatDayTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { channelName, supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Button, Chips, Logo, Pill, Screen, styles } from '@/lib/ui';
import { colorFor } from '@/lib/mappers';

type Req = {
  id: string; text: string; category: string | null; price_hint: number | null; created_at: string;
  shop_name: string | null; district: string | null; phone: string | null; mine: boolean; my_offer: string | null; offers: number; qty: number | null; unit: string | null; blocked: boolean;
};
type Deal = {
  id: string; firm_id: string; firm_name: string; firm_logo: string | null; text: string; category: string | null; price: number | null;
  created_at: string; employee_name: string | null; phone: string | null; mine: boolean; interested: boolean; interests: number | null; qty: number | null; unit: string | null;
};
type Tab = 'wants' | 'offers';

/** «հենց հիմա», «5 ր առաջ», «2 ժ առաջ», հետո՝ ամսաթիվ */
function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'հենց հիմա';
  if (m < 60) return `${m} ր առաջ`;
  if (m < 24 * 60) return `${Math.round(m / 60)} ժ առաջ`;
  return formatDayTime(iso);
}

const input = { minHeight: 52, borderWidth: 2, borderColor: colors.dark, borderRadius: radius.lg, paddingHorizontal: 16, fontSize: 16, backgroundColor: colors.card, color: colors.text } as const;

export default function LiveMarket() {
  const { session, employees, links } = useStore();
  const isShop = session?.kind === 'shop';
  const me = session?.kind === 'employee' ? employees.find((e) => e.id === session.employeeId) : undefined;
  const [tab, setTab] = useState<Tab>(isShop ? 'offers' : 'wants');
  const [reqs, setReqs] = useState<Req[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [text, setText] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<string>('հատ');
  const [msg, setMsg] = useState<string | null>(null);
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const [offerText, setOfferText] = useState('');
  const [offerPrice, setOfferPrice] = useState('');
  const [whoFor, setWhoFor] = useState<string | null>(null);
  const [who, setWho] = useState<{ shop_id: string; name: string; district: string | null; phone: string | null }[]>([]);

  const load = useCallback(async () => {
    const [r, d] = await Promise.all([supabase.rpc('live_requests'), supabase.rpc('live_deals')]);
    setReqs((r.data ?? []) as Req[]);
    setDeals((d.data ?? []) as Deal[]);
  }, []);
  useEffect(() => {
    load();
    const ch = supabase
      .channel(channelName('live-market'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supply_requests' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supply_offers' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_deals' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_interests' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);
  if (!isShop && !me) return <Redirect href="/" />;
  const shopId = session?.kind === 'shop' ? session.shopId : null;

  // Վերևի դաշտը. խանութը միշտ գրում է «ինչ է պետք», մատակարարը՝ «ինչ է առաջարկում» (ցանկացած ներդիրից)
  const canPost = isShop || !!me;
  const postKind: Tab = isShop ? 'wants' : 'offers';
  const post = async () => {
    const t = text.trim();
    if (t.length < 2) return setMsg('Գրեք ապրանքը');
    const q = qty ? Number(qty.replace(',', '.')) : null;
    if (q !== null && !(q > 0)) return setMsg('Քանակը պետք է լինի 0-ից մեծ թիվ');
    const row = { text: t, qty: q, unit: q ? unit : null };
    const p = price ? Number(price) : null;
    const { error } =
      postKind === 'wants'
        ? await supabase.from('supply_requests').insert({ ...row, shop_id: shopId, price_hint: p })
        : await supabase.from('supplier_deals').insert({ ...row, firm_id: me!.firmId, employee_id: me!.id, price: p });
    if (error) return setMsg(error.message);
    setText('');
    setPrice('');
    setQty('');
    setMsg(null);
    setTab(postKind); // ցույց տալ հենց հրապարակվածը
    load();
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, flex: 1 }}>
          <Text style={{ color: '#2E9E5B' }}>●</Text> Live շուկա
        </Text>
      </View>
      {canPost ? (
        <View style={{ gap: 8, marginBottom: 12 }}>
          <Text style={styles.strong}>{postKind === 'wants' ? '📣 Ի՞նչ ապրանք եք փնտրում' : '💼 Ի՞նչ եք առաջարկում'}</Text>
          <TextInput
            importantForAutofill="no"
            accessibilityLabel={postKind === 'wants' ? 'Ինչ ապրանք եք փնտրում' : 'Ինչ եք առաջարկում'}
            placeholder={postKind === 'wants' ? 'Օր.՝ Ձու C0' : 'Օր.՝ Ձու C0 թարմ, առաքում ամեն օր'}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            style={input}
          />
          {text.trim() ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  importantForAutofill="no"
                  accessibilityLabel="Քանակ"
                  placeholder="Քանակ"
                  placeholderTextColor={colors.textMuted}
                  value={qty}
                  onChangeText={(v) => setQty(v.replace(/[^\d.,]/g, ''))}
                  keyboardType="decimal-pad"
                  style={[input, { flex: 1, borderWidth: 1, borderColor: colors.borderStrong, minHeight: 46 }]}
                />
                <TextInput
                  importantForAutofill="no"
                  accessibilityLabel="Գին"
                  placeholder={`Գին, ֏/${unit} (ըստ ցանկ.)`}
                  placeholderTextColor={colors.textMuted}
                  value={price}
                  onChangeText={(v) => setPrice(v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  style={[input, { flex: 1.4, borderWidth: 1, borderColor: colors.borderStrong, minHeight: 46 }]}
                />
              </View>
              <Chips options={units.map((u) => ({ value: u, label: u }))} value={unit} onChange={setUnit} />
              <Button label={postKind === 'wants' ? '🔎 Գտնել մատակարար' : '📣 Առաջարկել շուկային'} onPress={post} />
            </>
          ) : null}
          {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
        </View>
      ) : null}
      <View style={{ marginBottom: 10 }}>
        <Chips
          options={[
            { value: 'wants', label: '🛒 Խանութները ուզում են', hint: `${reqs.length}` },
            { value: 'offers', label: '💼 Մատակարարները առաջարկում են', hint: `${deals.length}` },
          ]}
          value={tab}
          onChange={(v) => { setTab(v as Tab); setMsg(null); }}
        />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {tab === 'wants' ? (
          <>
            {reqs.length === 0 ? <Text style={styles.muted}>Դեռ հարցումներ չկան</Text> : null}
            {reqs.map((r) => (
              <View key={r.id} style={[styles.card, { gap: 6, borderColor: r.mine ? colors.dark : colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[styles.strong, { flex: 1, fontSize: 16 }]}>🛒 {r.text}</Text>
                  <Text style={styles.muted}>{ago(r.created_at)}</Text>
                </View>
                {amountLine(r.qty, r.unit, r.price_hint, 'ցանկալի՝ ') ? <Text style={styles.body}>{amountLine(r.qty, r.unit, r.price_hint, 'ցանկալի՝ ')}</Text> : null}
                <Text style={styles.muted}>
                  {[r.shop_name, r.district, r.category].filter(Boolean).join(' · ')}
                  {me && r.blocked ? ' · ⛔ ձեր սև ցուցակում է' : ''}
                </Text>
                {r.mine ? (
                  // Առաջարկները գնում են անձնական չաթ, այստեղ՝ միայն քանակը
                  <Pressable accessibilityRole="button" onPress={() => router.push(r.offers ? '/chats' : '/shop/requests')} hitSlop={8}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>
                      {r.offers ? `💼 Ստացել է ${r.offers} առաջարկ · 💬 չաթում →` : 'Ձեր հարցումն է · դեռ առաջարկ չկա'}
                    </Text>
                  </Pressable>
                ) : r.offers ? (
                  <Pill text={`💼 ${r.offers} առաջարկ`} tone="info" />
                ) : null}
                {me && r.my_offer ? (
                  <Pressable accessibilityRole="button" onPress={() => router.push('/chats')} hitSlop={8}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>✓ Ձեր առաջարկը ուղարկված է · 💬 չաթ →</Text>
                  </Pressable>
                ) : null}
                {me && !r.my_offer ? (
                  offerFor === r.id ? (
                    <View style={{ gap: 8 }}>
                      <TextInput
                        importantForAutofill="no"
                        accessibilityLabel="Ձեր առաջարկը"
                        placeholder="Ձեր առաջարկը (օր.՝ Ունենք, առաքում վաղը)"
                        placeholderTextColor={colors.textMuted}
                        value={offerText}
                        onChangeText={setOfferText}
                        multiline
                        style={[input, { borderWidth: 1, borderColor: colors.borderStrong, minHeight: 70, paddingVertical: 10, textAlignVertical: 'top' }]}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          importantForAutofill="no"
                          accessibilityLabel="Առաջարկի գինը"
                          placeholder="Գին ֏ (ըստ ցանկ.)"
                          placeholderTextColor={colors.textMuted}
                          value={offerPrice}
                          onChangeText={(v) => setOfferPrice(v.replace(/\D/g, ''))}
                          keyboardType="number-pad"
                          style={[input, { flex: 1, borderWidth: 1, borderColor: colors.borderStrong, minHeight: 46 }]}
                        />
                        <Button
                          label="Ուղարկել"
                          disabled={!offerText.trim()}
                          onPress={async () => {
                            const { error } = await supabase
                              .from('supply_offers')
                              .insert({ request_id: r.id, firm_id: me.firmId, employee_id: me.id, text: offerText.trim(), price: offerPrice ? Number(offerPrice) : null });
                            if (error) return setMsg(error.message);
                            setOfferFor(null);
                            load();
                          }}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Button kind="outline" label="💼 Առաջարկել" onPress={() => { setOfferFor(r.id); setOfferText(''); setOfferPrice(''); }} style={{ flex: 1 }} />
                      {r.phone ? (
                        <Pressable accessibilityRole="button" accessibilityLabel="Զանգել" onPress={() => Linking.openURL(`tel:${r.phone}`)} hitSlop={8} style={{ padding: 10 }}>
                          <Text style={{ fontSize: 20 }}>📞</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )
                ) : null}
              </View>
            ))}
          </>
        ) : (
          <>
            {deals.length === 0 ? <Text style={styles.muted}>Դեռ առաջարկներ չկան</Text> : null}
            {deals.map((d) => {
              const c = colorFor(d.firm_id);
              const linked = links.find((l) => l.shopId === shopId && l.firmId === d.firm_id)?.status === 'active';
              return (
                <View key={d.id} style={[styles.card, { gap: 6, borderColor: d.mine ? colors.dark : colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Logo name={d.firm_name} uri={d.firm_logo ?? undefined} bg={c.bg} fg={c.fg} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.strong}>{d.firm_name}</Text>
                      <Text style={styles.muted}>{[d.category, ago(d.created_at)].filter(Boolean).join(' · ')}</Text>
                    </View>
                    {d.price ? <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{formatAmd(Number(d.price))}{d.unit ? `/${d.unit}` : ''}</Text> : null}
                  </View>
                  <Text style={[styles.body, { fontSize: 16 }]}>💼 {d.text}</Text>
                  {d.qty ? <Text style={styles.muted}>{Number(d.qty)} {d.unit ?? ''}</Text> : null}
                  {isShop ? (
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      {d.interested ? (
                        <View style={{ flex: 1 }}>
                          <Pressable accessibilityRole="button" onPress={() => router.push('/chats')} hitSlop={8}>
                            <Text style={{ color: colors.primary, fontWeight: '600' }}>✓ Գրել եք մատակարարին · 💬 չաթ →</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Button
                          label="🙋 Հետաքրքրված եմ"
                          onPress={async () => {
                            const { error } = await supabase.from('deal_interests').insert({ deal_id: d.id, shop_id: shopId });
                            if (error) setMsg(error.message);
                            load();
                          }}
                          style={{ flex: 1 }}
                        />
                      )}
                      <Pressable accessibilityRole="button" onPress={() => router.push(linked ? `/shop/supplier/${d.firm_id}` : `/shop/firm/${d.firm_id}`)} hitSlop={8} style={{ padding: 8 }}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>{linked ? 'Պատվիրել →' : 'Դիտել →'}</Text>
                      </Pressable>
                      {d.phone ? (
                        <Pressable accessibilityRole="button" accessibilityLabel="Զանգել" onPress={() => Linking.openURL(`tel:${d.phone}`)} hitSlop={8} style={{ padding: 8 }}>
                          <Text style={{ fontSize: 20 }}>📞</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  {d.mine ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        onPress={async () => {
                          if (whoFor === d.id) return setWhoFor(null);
                          setWhoFor(d.id);
                          const { data } = await supabase.rpc('deal_interested_shops', { p_deal: d.id });
                          setWho((data ?? []) as typeof who);
                        }}
                        hitSlop={8}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>🙋 Հետաքրքրված է՝ {d.interests ?? 0} խանութ {whoFor === d.id ? '▴' : '▾'}</Text>
                      </Pressable>
                      {whoFor === d.id
                        ? who.map((w) => (
                            <View key={w.shop_id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4 }}>
                              <Text style={[styles.body, { flex: 1 }]}>
                                {w.name}
                                {w.district ? ` · ${w.district}` : ''}
                              </Text>
                              {w.phone ? (
                                <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${w.phone}`)} hitSlop={8}>
                                  <Text style={{ color: colors.primary, fontWeight: '600' }}>📞 {w.phone}</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          ))
                        : null}
                      <Pressable
                        accessibilityRole="button"
                        onPress={async () => {
                          await supabase.from('supplier_deals').update({ status: 'closed' }).eq('id', d.id);
                          load();
                        }}
                        hitSlop={8}>
                        <Text style={{ color: colors.textMuted }}>Փակել առաջարկը</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const units = ['հատ', 'կգ', 'լ', 'տուփ', 'արկղ', 'բլոկ'];
/** «300 հատ · 60 ֏/հատ» */
function amountLine(qty: number | null, unit: string | null, price: number | null, priceLabel = '') {
  return [qty ? `${Number(qty)} ${unit ?? ''}`.trim() : null, price ? `${priceLabel}${formatAmd(Number(price))}${unit ? `/${unit}` : ''}` : null].filter(Boolean).join(' · ');
}
