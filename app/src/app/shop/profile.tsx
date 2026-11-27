// Իմ տվյալները. այն, ինչ մատակարարը տեսնում է միանալու հայտում և «Բոլոր խանութները» ցուցակում
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { districts } from '@/lib/districts';
import { currentPoint } from '@/lib/geo';
import { isValidPhone, normalizePhone } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Button, Card, Chips, Field, Screen, styles, Title } from '@/lib/ui';

export default function ShopProfile() {
  const { session, shops, updateShop } = useStore();
  const shop = session?.kind === 'shop' ? shops.find((s) => s.id === session.shopId) : undefined;
  const [f, setF] = useState({
    name: shop?.name ?? '',
    legal_name: shop?.legalName ?? '',
    tax_id: shop?.taxId ?? '',
    district: shop?.district ?? '',
    address: shop?.address ?? '',
    phone: shop?.phone ?? '',
    email: shop?.email ?? '',
    contact_person: shop?.contactPerson ?? '',
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [locating, setLocating] = useState(false);
  if (!shop) return <Redirect href="/" />;
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const phoneBad = f.phone.replace(/\D/g, '').length > 3 && !isValidPhone(f.phone);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub="Մատակարարները տեսնում են սրանք միանալու հայտում">Իմ տվյալները</Title>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
        <Card style={{ gap: 12 }}>
          <Field label="Ցուցանակի անուն" value={f.name} onChangeText={set('name')} />
          <Field label="Իրավաբանական անվանում" value={f.legal_name} onChangeText={set('legal_name')} />
          <Field label="ՀՎՀՀ" value={f.tax_id} onChangeText={(v) => set('tax_id')(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" />
          <Text style={styles.muted}>Թաղամաս</Text>
          <Chips options={districts.map((d) => ({ value: d, label: d }))} value={f.district} onChange={set('district')} />
          <Field label="Հասցե" value={f.address} onChangeText={set('address')} autoComplete="off" />
          {/* Տեղը քարտեզի վրա՝ մոտակա մատակարարներին գտնելու և վարորդի երթուղու համար */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[styles.body, { flex: 1 }]}>{shop.lat != null ? '📍 Տեղը նշված է ✓' : '📍 Տեղը դեռ նշված չէ'}</Text>
            <Button
              kind="outline"
              label={locating ? 'Որոշվում է…' : shop.lat != null ? 'Թարմացնել' : 'Նշել իմ տեղը'}
              disabled={locating}
              onPress={async () => {
                setLocating(true);
                const p = await currentPoint();
                setLocating(false);
                if (!p) return setMsg({ ok: false, text: 'Չհաջողվեց որոշել տեղը. թույլ տվեք տեղորոշումը և փորձեք խանութում' });
                const err = await updateShop({ lat: p.lat, lng: p.lng });
                setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Տեղը պահված է ✓' });
              }}
            />
          </View>
          <Text style={styles.muted}>Սեղմեք, երբ գտնվում եք խանութում։</Text>
          <Field label="Հեռախոս" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
          <Field label="Էլ. փոստ" value={f.email} onChangeText={set('email')} keyboardType="email-address" />
          <Field label="Կոնտակտային անձ" value={f.contact_person} onChangeText={set('contact_person')} autoComplete="name" />
        </Card>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.strong}>Երևալ մատակարարներին</Text>
            <Text style={styles.muted}>Մատակարարները կտեսնեն ձեր խանութը «Բոլոր խանութները» ցուցակում և կարող են զանգել առաջարկով</Text>
          </View>
          <Switch
            value={shop.listed !== false}
            onValueChange={async (v) => {
              const err = await updateShop({ listed: v });
              if (err) setMsg({ ok: false, text: err });
            }}
          />
        </Card>
        {msg ? <Text style={{ color: msg.ok ? colors.primary : colors.warnText, textAlign: 'center' }}>{msg.text}</Text> : null}
        <Button
          label="Պահել"
          disabled={!/^\d{8}$/.test(f.tax_id) || !f.name || phoneBad}
          onPress={async () => {
            const err = await updateShop({ ...f, phone: f.phone.replace(/\D/g, '').length > 3 ? normalizePhone(f.phone) : '' });
            setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Պահված է ✓' });
          }}
        />
      </ScrollView>
    </Screen>
  );
}
