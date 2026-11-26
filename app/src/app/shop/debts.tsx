// Հաշիվներ. պարտքը ամեն մատակարարին և «Վճարել եմ» (հաստատում է մատակարարը)
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { formatAmd } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors, radius } from '@/lib/theme';
import { Button, Logo, Screen, styles, Title } from '@/lib/ui';

export default function ShopDebts() {
  const { session, debts, firms, links, markPaid } = useStore();
  const [payFor, setPayFor] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const myFirms = links.filter((l) => l.shopId === session.shopId && l.status === 'active').map((l) => l.firmId);
  const rows = myFirms.map((fid) => ({ firm: firms.find((f) => f.id === fid)!, d: debts.find((x) => x.firmId === fid && x.shopId === session.shopId) }));
  const total = rows.reduce((s, r) => s + (r.d?.debt ?? 0), 0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub={`Ընդհանուր պարտք՝ ${formatAmd(total)}`}>Հաշիվներ</Title>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {rows.map(({ firm, d }) => (
          <View key={firm.id} style={[styles.card, { gap: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Logo name={firm.name} uri={firm.logoUrl} bg={firm.color.bg} fg={firm.color.fg} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{firm.name}</Text>
                <Text style={styles.muted}>Առաքված՝ {formatAmd(d?.delivered ?? 0)} · վճարված՝ {formatAmd(d?.paid ?? 0)}</Text>
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: (d?.debt ?? 0) > 0 ? colors.dark : colors.primary }}>{formatAmd(d?.debt ?? 0)}</Text>
            </View>
            {d?.pending ? <Text style={styles.muted}>Սպասում է հաստատման՝ {formatAmd(d.pending)}</Text> : null}
            {payFor === firm.id ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  accessibilityLabel="Գումար"
                  placeholder="Գումար, ֏"
                  value={amount}
                  onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: 10, backgroundColor: colors.card, color: colors.text }}
                />
                <Button
                  label="Ուղարկել"
                  disabled={!amount}
                  onPress={async () => {
                    const err = await markPaid(firm.id, Number(amount), '');
                    setMsg(err);
                    if (!err) { setPayFor(null); setAmount(''); }
                  }}
                />
              </View>
            ) : (
              <Button kind="outline" label="Վճարել եմ" onPress={() => { setPayFor(firm.id); setAmount(d?.debt ? String(Math.round(d.debt)) : ''); }} />
            )}
          </View>
        ))}
        {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
        <Text style={[styles.muted, { textAlign: 'center' }]}>Վճարումը պարտքից հանվում է, երբ մատակարարը հաստատում է, որ գումարը ստացել է</Text>
      </ScrollView>
    </Screen>
  );
}
