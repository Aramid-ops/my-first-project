// Հաշիվներ. պարտքը ամեն մատակարարին և «Վճարել եմ» (եղանակ, չեկի նկար). պարտքից հանվում է, երբ մատակարարը հաստատում է
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { pickPrivateDoc } from '@/lib/media';
import { formatAmd } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { paymentMethodLabel, type PaymentMethod } from '@/lib/types';
import { Button, Chips, Field, Logo, Screen, styles, Title } from '@/lib/ui';

type Draft = { firmId: string; amount: string; method: PaymentMethod; receipt?: string; note: string };

export default function ShopDebts() {
  const { session, debts, firms, links, markPaid } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const shopId = session.shopId;
  const rows = links
    .filter((l) => l.shopId === shopId && l.status === 'active')
    .map((l) => ({ firm: firms.find((f) => f.id === l.firmId)!, d: debts.find((x) => x.firmId === l.firmId && x.shopId === shopId) }))
    .filter((r) => r.firm);
  const total = rows.reduce((s, r) => s + (r.d?.debt ?? 0), 0);
  // Կարելի է նշել միայն չհաստատված վճարումներից դուրս մնացած պարտքը
  const openDebt = (d?: (typeof rows)[number]['d']) => Math.max(0, Math.floor((d?.debt ?? 0) - (d?.pending ?? 0)));
  const set = (patch: Partial<Draft>) => setDraft((x) => (x ? { ...x, ...patch } : x));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title>Հաշիվներ</Title>
      </View>
      <View style={[styles.card, { marginBottom: 12, alignItems: 'center', gap: 2 }]}>
        <Text style={styles.muted}>Ընդհանուր պարտք</Text>
        <Text style={{ fontSize: 28, fontWeight: '800', color: total > 0 ? colors.dark : colors.primary }}>{formatAmd(total)}</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {rows.map(({ firm, d }) => {
          const open = openDebt(d);
          const editing = draft?.firmId === firm.id;
          return (
            <View key={firm.id} style={[styles.card, { gap: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Logo name={firm.name} uri={firm.logoUrl} bg={firm.color.bg} fg={firm.color.fg} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{firm.name}</Text>
                  {d?.delivered ? <Text style={styles.muted}>Առաքված՝ {formatAmd(d.delivered)} · վճարված՝ {formatAmd(d.paid)}</Text> : null}
                </View>
                <Text style={{ fontSize: 17, fontWeight: '700', color: (d?.debt ?? 0) > 0 ? colors.dark : colors.primary }}>{formatAmd(d?.debt ?? 0)}</Text>
              </View>
              {d?.pending ? <Text style={styles.muted}>⏳ Սպասում է մատակարարի հաստատման՝ {formatAmd(d.pending)}</Text> : null}

              {editing && draft ? (
                <View style={{ gap: 10 }}>
                  <Field label={`Գումար (առավելագույնը՝ ${formatAmd(open)})`} value={draft.amount} onChangeText={(v) => set({ amount: v.replace(/\D/g, '') })} keyboardType="number-pad" />
                  <Text style={styles.muted}>Ինչպես եք վճարել</Text>
                  <Chips
                    options={(Object.keys(paymentMethodLabel) as PaymentMethod[]).map((m) => ({ value: m, label: paymentMethodLabel[m] }))}
                    value={draft.method}
                    onChange={(m) => set({ method: m })}
                  />
                  <Field label="Նշում (օր.՝ ում եք տվել)" value={draft.note} onChangeText={(v) => set({ note: v })} autoComplete="off" />
                  <Button
                    kind="outline"
                    label={draft.receipt ? '📎 Չեկը կցված է ✓' : '📎 Կցել չեկ / սքրինշոթ'}
                    onPress={async () => {
                      const r = await pickPrivateDoc(shopId, 'receipt', 'library', 'receipts');
                      if (r.path) set({ receipt: r.path });
                      if (r.error) setMsg(r.error);
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button kind="outline" label="Չեղարկել" onPress={() => setDraft(null)} style={{ flex: 1 }} />
                    <Button
                      label={busy ? 'Ուղարկվում է…' : 'Ուղարկել'}
                      disabled={busy || !Number(draft.amount) || Number(draft.amount) > open}
                      onPress={async () => {
                        setBusy(true);
                        const err = await markPaid(firm.id, Number(draft.amount), draft.note.trim(), draft.method, draft.receipt);
                        setBusy(false);
                        setMsg(err ?? `✓ Ուղարկված է։ ${firm.name}-ը կհաստատի, երբ գումարը ստանա։`);
                        if (!err) setDraft(null);
                      }}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ) : open > 0 ? (
                <Button kind="outline" label="Վճարել եմ" onPress={() => { setMsg(null); setDraft({ firmId: firm.id, amount: String(open), method: 'transfer', note: '' }); }} />
              ) : null}
            </View>
          );
        })}
        {msg ? <Text style={{ color: msg.startsWith('✓') ? colors.primary : colors.warnText }}>{msg}</Text> : null}
        <Text style={[styles.muted, { textAlign: 'center' }]}>Վճարումը պարտքից հանվում է, երբ մատակարարը հաստատում է, որ գումարը ստացել է</Text>
      </ScrollView>
    </Screen>
  );
}
