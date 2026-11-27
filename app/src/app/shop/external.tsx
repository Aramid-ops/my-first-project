// Մատակարարներ, որոնք դեռ հավելվածում չեն. պատվերը ուղարկվում է WhatsApp / Viber / SMS-ով
// և պահվում է խանութի պատվերների ցուցակում։
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { isValidPhone, normalizePhone } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Button, Card, Chips, Field, Screen, styles, Title } from '@/lib/ui';

type Channel = 'whatsapp' | 'viber' | 'sms';
type Ext = { id: string; name: string; category: string | null; phone: string; channel: Channel };
type Form = { id?: string; name: string; category: string; phone: string; channel: Channel };
const channelLabel: Record<Channel, string> = { whatsapp: 'WhatsApp', viber: 'Viber', sms: 'SMS' };
const emptyForm: Form = { name: '', category: '', phone: '+374 ', channel: 'whatsapp' };

function openMessage(ext: Ext, text: string) {
  const digits = normalizePhone(ext.phone).slice(1);
  const t = encodeURIComponent(text);
  const url =
    ext.channel === 'whatsapp' ? `https://wa.me/${digits}?text=${t}`
    : ext.channel === 'viber' ? `viber://forward?text=${t}` // Viber-ում ընտրում եք ստացողին
    : `sms:+${digits}${Platform.OS === 'ios' ? '&' : '?'}body=${t}`;
  return Linking.openURL(url);
}

/** Հաստատում (վեբում՝ confirm, հեռախոսում՝ Alert) */
function confirm(question: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(question)) onYes();
  } else Alert.alert(question, undefined, [{ text: 'Ոչ', style: 'cancel' }, { text: 'Այո', style: 'destructive', onPress: onYes }]);
}

export default function ExternalSuppliers() {
  const { session, shops } = useStore();
  const [list, setList] = useState<Ext[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const { open } = useLocalSearchParams<{ open?: string }>();
  const [openId, setOpenId] = useState<string | null>(open ?? null);
  const [text, setText] = useState('');
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const shop = session?.kind === 'shop' ? shops.find((s) => s.id === session.shopId) : undefined;

  const load = useCallback(async () => {
    const { data } = await supabase.from('external_suppliers').select('id, name, category, phone, channel').order('name');
    setList((data ?? []) as Ext[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!shop) return <Redirect href="/" />;

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) return setFormErr('Գրեք մատակարարի անունը');
    if (!isValidPhone(form.phone)) return setFormErr('Համարը սխալ է։ Օրինակ՝ +374 77 123456');
    const row = { name: form.name.trim(), category: form.category.trim() || null, phone: normalizePhone(form.phone), channel: form.channel };
    const { error } = form.id
      ? await supabase.from('external_suppliers').update(row).eq('id', form.id)
      : await supabase.from('external_suppliers').insert({ shop_id: shop.id, ...row });
    if (error) return setFormErr(error.message);
    setForm(null);
    setOpenId(null);
    load();
  };

  const send = async (e: Ext) => {
    const body = text.trim();
    // նախ պահում ենք պատվերների մեջ, հետո բացում հաղորդագրությունը
    await supabase.from('external_orders').insert({ shop_id: shop.id, supplier_id: e.id, supplier_name: e.name, channel: e.channel, text: body });
    await openMessage(e, `Պատվեր · ${shop.name}${shop.address ? `, ${shop.address}` : ''}\n\n${body}\n\n— Մատակարար հավելված`);
    setText('');
    setOpenId(null);
    setSentMsg(`✓ Պատվերը պահված է «Պատվերներ»-ում (${e.name})`);
  };

  const formCard = form ? (
    <Card style={{ gap: 10 }}>
      <Field label="Մատակարարի անուն" value={form.name} onChangeText={(v) => { setForm({ ...form, name: v }); setFormErr(null); }} placeholder="Օր.՝ Արմեն" autoComplete="off" />
      <Field label="Ինչ է մատակարարում" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="Օր.՝ ածուխ, մրգեր, հաց" autoComplete="off" />
      <Field
        label="Հեռախոս"
        value={form.phone}
        onChangeText={(v) => { setForm({ ...form, phone: v }); setFormErr(null); }}
        keyboardType="phone-pad"
        placeholder="+374 77 123456"
        autoComplete="off"
      />
      <Chips options={(Object.keys(channelLabel) as Channel[]).map((c) => ({ value: c, label: channelLabel[c] }))} value={form.channel} onChange={(c) => setForm({ ...form, channel: c })} />
      {formErr ? <Text style={{ color: colors.warnText }}>{formErr}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button kind="outline" label="Չեղարկել" onPress={() => { setForm(null); setFormErr(null); }} style={{ flex: 1 }} />
        <Button label="Պահել" onPress={save} style={{ flex: 1 }} />
      </View>
    </Card>
  ) : null;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub="Պատվերը կգնա հաղորդագրությամբ">Այլ մատակարարներ</Title>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {sentMsg ? <Text style={{ color: colors.primary }}>{sentMsg}</Text> : null}
        {list.map((e) =>
          form?.id === e.id ? (
            <View key={e.id}>{formCard}</View>
          ) : (
            <View key={e.id} style={[styles.card, { gap: 8 }]}>
              <Pressable accessibilityRole="button" onPress={() => { setOpenId(openId === e.id ? null : e.id); setText(''); setSentMsg(null); }} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{e.name}</Text>
                  {e.category ? <Text style={styles.body}>{e.category}</Text> : null}
                  <Text style={styles.muted}>
                    {e.phone} · {channelLabel[e.channel]}
                  </Text>
                </View>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Պատվիրել</Text>
              </Pressable>
              {openId === e.id ? (
                <>
                  <TextInput
                    importantForAutofill="no"
                    accessibilityLabel="Պատվերի տեքստ"
                    multiline
                    placeholder={'Գրեք կամ թելադրեք 🎤, օր.՝\nԿաթ 1 լ — 24 հատ\nՊանիր — 3 կգ'}
                    value={text}
                    onChangeText={setText}
                    style={{ minHeight: 110, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 12, fontSize: 15, backgroundColor: colors.card, color: colors.text, textAlignVertical: 'top' }}
                  />
                  <Button label={`Ուղարկել ${channelLabel[e.channel]}-ով`} disabled={!text.trim()} onPress={() => send(e)} />
                  <View style={{ flexDirection: 'row', gap: 20, justifyContent: 'center', paddingTop: 4 }}>
                    <Pressable accessibilityRole="button" onPress={() => { setForm({ ...e, category: e.category ?? '' }); setFormErr(null); }} hitSlop={8}>
                      <Text style={{ color: colors.primary, fontWeight: '600' }}>✏️ Փոխել</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() =>
                        confirm(`Ջնջե՞լ «${e.name}»-ին`, async () => {
                          await supabase.from('external_suppliers').delete().eq('id', e.id);
                          setOpenId(null);
                          load();
                        })
                      }>
                      <Text style={{ color: colors.warnText, fontWeight: '600' }}>🗑 Ջնջել</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </View>
          ),
        )}

        {form && !form.id ? formCard : null}
        {!form ? <Button kind="outline" label="+ Ավելացնել մատակարար" onPress={() => { setForm(emptyForm); setFormErr(null); setSentMsg(null); }} /> : null}
      </ScrollView>
    </Screen>
  );
}
