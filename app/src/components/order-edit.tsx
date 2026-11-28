// ✏️ Պատվերի ուղղում (միայն այս պատվերի համար). ուղարկվող քանակ, գին, փոխարինող ապրանք։
// Դատարկ դաշտ = ինչպես պատվիրված է։ Ապրանքի հիմնական գինը չի փոխվում. խանութը տեսնում է փոփոխությունը և ստանում ծանուցում։
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { formatAmd } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { Order, OrderItem } from '@/lib/types';
import { Button, Chips, styles } from '@/lib/ui';

const s = (v?: number) => (v == null ? '' : String(v));
const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null);

export function OrderEdit({ order, onDone }: { order: Order; onDone: () => void }) {
  const { products, reload } = useStore();
  const [vals, setVals] = useState<Record<string, { qty: string; price: string }>>(
    Object.fromEntries(order.items.map((i) => [i.id!, { qty: s(i.sentQty), price: s(i.finalPrice) }])),
  );
  const [sub, setSub] = useState<{ item: string; product: string; qty: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alternatives = products.filter((p) => p.firmId === order.firmId && p.inStock);

  const save = async () => {
    setBusy(true);
    for (const i of order.items) {
      const v = vals[i.id!];
      const q = num(v.qty), pr = num(v.price);
      if (q === (i.sentQty ?? null) && pr === (i.finalPrice ?? null)) continue;
      const { error } = await supabase.rpc('edit_order_item', { p_item: i.id, p_sent_qty: q, p_price: pr });
      if (error) {
        setBusy(false);
        return setMsg(error.message);
      }
    }
    setBusy(false);
    await reload();
    onDone();
  };

  const proposeSub = async () => {
    if (!sub) return;
    const { error } = await supabase.rpc('propose_substitute', { p_item: sub.item, p_product: sub.product, p_qty: num(sub.qty) });
    if (error) return setMsg(error.message);
    setSub(null);
    setMsg('✓ Առաջարկը ուղարկված է խանութին');
    reload();
  };

  const row = (i: OrderItem) => {
    const p = products.find((x) => x.id === i.productId);
    const v = vals[i.id!];
    const set = (patch: Partial<typeof v>) => setVals((all) => ({ ...all, [i.id!]: { ...v, ...patch } }));
    return (
      <View key={i.id} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={styles.body}>
          {p?.name} <Text style={styles.muted}>· պատվիրել է {i.qty} {p?.unit} · {formatAmd(i.price ?? 0)}</Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput placeholderTextColor={colors.textMuted} importantForAutofill="no" accessibilityLabel="Ուղարկվող քանակ" placeholder={`Քանակ (${i.qty})`} value={v.qty}
            onChangeText={(t) => set({ qty: t.replace(/[^\d.,]/g, '') })} keyboardType="number-pad" style={input} />
          <TextInput placeholderTextColor={colors.textMuted} importantForAutofill="no" accessibilityLabel="Գին այս պատվերի համար" placeholder={`Գին (${i.price ?? ''})`} value={v.price}
            onChangeText={(t) => set({ price: t.replace(/[^\d.,]/g, '') })} keyboardType="number-pad" style={input} />
        </View>
        {i.subStatus === 'proposed' ? (
          <Text style={styles.muted}>🔄 Փոխարինումը սպասում է խանութի պատասխանին</Text>
        ) : sub && sub.item === i.id ? (
          <View style={{ gap: 6 }}>
            <Chips options={alternatives.filter((a) => a.id !== i.productId).map((a) => ({ value: a.id, label: `${a.name} · ${formatAmd(a.price)}` }))} value={sub!.product} onChange={(v2) => setSub((x) => x && { ...x, product: v2 })} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput placeholderTextColor={colors.textMuted} importantForAutofill="no" accessibilityLabel="Փոխարինողի քանակ" placeholder="Քանակ" value={sub!.qty}
                onChangeText={(t) => setSub((x) => x && { ...x, qty: t.replace(/[^\d.,]/g, '') })} keyboardType="number-pad" style={input} />
              <Button label="Առաջարկել" disabled={!sub!.product || !sub!.qty} onPress={proposeSub} />
              <Button kind="outline" label="✕" onPress={() => setSub(null)} />
            </View>
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setSub({ item: i.id!, product: '', qty: String(i.qty) })} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>🔄 Առաջարկել փոխարինող</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={{ gap: 6, backgroundColor: '#FBF3EC', borderRadius: radius.md, padding: 10 }}>
      <Text style={styles.muted}>Դատարկ՝ ինչպես պատվիրված է։ Ապրանքի հիմնական գինը չի փոխվի։</Text>
      {order.items.map(row)}
      {msg ? <Text style={{ color: msg.startsWith('✓') ? colors.primary : colors.warnText }}>{msg}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button kind="outline" label="Փակել" onPress={onDone} style={{ flex: 1 }} />
        <Button label={busy ? 'Պահվում է…' : 'Պահել'} disabled={busy} onPress={save} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** Տողի ցուցադրում. փոխված քանակը/գինը՝ ընդգծված (հին արժեքը՝ ջնջված) */
export function ItemChange({ item: i, unit }: { item: OrderItem; unit?: string }) {
  const qtyChanged = i.sentQty != null && i.sentQty !== i.qty;
  const priceChanged = i.finalPrice != null && i.finalPrice !== i.price;
  if (!qtyChanged && !priceChanged) return null;
  return (
    <Text style={{ color: colors.warnText, fontSize: 13 }}>
      ✏️ {qtyChanged ? <><Text style={{ textDecorationLine: 'line-through' }}>{i.qty}</Text> → {i.sentQty} {unit}</> : null}
      {qtyChanged && priceChanged ? ' · ' : ''}
      {priceChanged ? <><Text style={{ textDecorationLine: 'line-through' }}>{formatAmd(i.price ?? 0)}</Text> → {formatAmd(i.finalPrice!)}</> : null}
    </Text>
  );
}

const input = {
  flex: 1,
  minHeight: 42,
  borderWidth: 1,
  borderColor: colors.borderStrong,
  borderRadius: radius.sm,
  paddingHorizontal: 10,
  backgroundColor: colors.card,
  color: colors.text,
} as const;
