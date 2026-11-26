// Իմ տվյալները. այն, ինչ մատակարարը տեսնում է միանալու հայտում
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Button, Card, Field, Screen, Title } from '@/lib/ui';

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
  if (!shop) return <Redirect href="/" />;
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

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
          <Field label="Թաղամաս" value={f.district} onChangeText={set('district')} />
          <Field label="Հասցե" value={f.address} onChangeText={set('address')} />
          <Field label="Հեռախոս" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
          <Field label="Էլ. փոստ" value={f.email} onChangeText={set('email')} keyboardType="email-address" />
          <Field label="Կոնտակտային անձ" value={f.contact_person} onChangeText={set('contact_person')} />
        </Card>
        {msg ? <Text style={{ color: msg.ok ? colors.primary : colors.warnText, textAlign: 'center' }}>{msg.text}</Text> : null}
        <Button
          label="Պահել"
          disabled={!/^\d{8}$/.test(f.tax_id) || !f.name}
          onPress={async () => {
            const err = await updateShop(f);
            setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Պահված է ✓' });
          }}
        />
      </ScrollView>
    </Screen>
  );
}
