// Մատակարարներ, որոնք դեռ հավելվածում չեն. պատվերը ուղարկվում է WhatsApp / Viber / SMS-ով
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Button, Card, Chips, Field, Screen, styles, Title } from '@/lib/ui';

type Channel = 'whatsapp' | 'viber' | 'sms';
type Ext = { id: string; name: string; phone: string; channel: Channel };
const channelLabel: Record<Channel, string> = { whatsapp: 'WhatsApp', viber: 'Viber', sms: 'SMS' };

function openMessage(ext: Ext, text: string) {
  const digits = ext.phone.replace(/\D/g, '');
  const t = encodeURIComponent(text);
  const url =
    ext.channel === 'whatsapp' ? `https://wa.me/${digits}?text=${t}`
    : ext.channel === 'viber' ? `viber://forward?text=${t}` // Viber-ում ընտրում եք ստացողին
    : `sms:+${digits}?body=${t}`;
  return Linking.openURL(url);
}

export default function ExternalSuppliers() {
  const { session, shops } = useStore();
  const [list, setList] = useState<Ext[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ name: string; phone: string; channel: Channel }>({ name: '', phone: '', channel: 'whatsapp' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const shop = session?.kind === 'shop' ? shops.find((s) => s.id === session.shopId) : undefined;

  const load = useCallback(async () => {
    const { data } = await supabase.from('external_suppliers').select('id, name, phone, channel').order('name');
    setList((data ?? []) as Ext[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!shop) return <Redirect href="/" />;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub="Պատվերը կգնա հաղորդագրությամբ">Այլ մատակարարներ</Title>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {list.map((e) => (
          <View key={e.id} style={[styles.card, { gap: 8 }]}>
            <Pressable accessibilityRole="button" onPress={() => { setOpenId(openId === e.id ? null : e.id); setText(''); }} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{e.name}</Text>
                <Text style={styles.muted}>
                  {e.phone} · {channelLabel[e.channel]}
                </Text>
              </View>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Պատվիրել</Text>
            </Pressable>
            {openId === e.id ? (
              <>
                <TextInput importantForAutofill="no"
                  accessibilityLabel="Պատվերի տեքստ"
                  multiline
                  placeholder={'Օր.՝\nԿաթ 1 լ — 24 հատ\nՊանիր — 3 կգ'}
                  value={text}
                  onChangeText={setText}
                  style={{ minHeight: 110, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 12, fontSize: 15, backgroundColor: colors.card, color: colors.text, textAlignVertical: 'top' }}
                />
                <Button
                  label={`Ուղարկել ${channelLabel[e.channel]}-ով`}
                  disabled={!text.trim()}
                  onPress={() => openMessage(e, `Պատվեր · ${shop.name}${shop.address ? `, ${shop.address}` : ''}\n\n${text.trim()}\n\n— Մատակարար հավելված`)}
                />
              </>
            ) : null}
          </View>
        ))}

        {adding ? (
          <Card style={{ gap: 10 }}>
            <Field label="Մատակարարի անուն" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
            <Field label="Հեռախոս (+374...)" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
            <Chips options={(Object.keys(channelLabel) as Channel[]).map((c) => ({ value: c, label: channelLabel[c] }))} value={form.channel} onChange={(c) => setForm({ ...form, channel: c })} />
            <Button
              label="Պահել"
              disabled={!form.name || form.phone.replace(/\D/g, '').length < 8}
              onPress={async () => {
                await supabase.from('external_suppliers').insert({ shop_id: shop.id, ...form });
                setAdding(false);
                setForm({ name: '', phone: '', channel: 'whatsapp' });
                load();
              }}
            />
          </Card>
        ) : (
          <Button kind="outline" label="+ Ավելացնել մատակարար" onPress={() => setAdding(true)} />
        )}
      </ScrollView>
    </Screen>
  );
}
