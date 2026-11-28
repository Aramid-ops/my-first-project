// Պատվերի մանրամասներ. վիճակ, ապրանքներ, «Խնդիր» ամեն տողի կողքին, «Կրկնել պատվերը»
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ItemChange } from '@/components/order-edit';
import { pickAndUpload } from '@/lib/media';
import { formatAmd, formatQty, formatTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { issueLabel, linePrice, lineQty, shopStatusLabel, type IssueKind } from '@/lib/types';
import { Button, Chips, Pill, Screen, styles, Title } from '@/lib/ui';

export default function ShopOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, orders, firms, products, issues, reportIssue, repeatOrder, reload } = useStore();
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [kind, setKind] = useState<IssueKind>('broken');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | undefined>();
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const o = orders.find((x) => x.id === id);
  if (!o) return <Redirect href="/shop/orders" />;
  const firm = firms.find((f) => f.id === o.firmId);
  const myIssues = issues.filter((x) => x.orderId === o.id);
  const total = o.items.reduce((sum, i) => sum + lineQty(i) * linePrice(i), 0);
  const answer = async (itemId: string, accept: boolean) => {
    const { error } = await supabase.rpc('answer_substitute', { p_item: itemId, p_accept: accept });
    setMsg(error?.message ?? null);
    reload();
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub={o.invoiceNumber ? `Ֆակտուրա № ${o.invoiceNumber}` : undefined}>{firm?.name}</Title>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        <View style={[styles.card, { gap: 6 }]}>
          <Pill text={shopStatusLabel[o.status]} tone={o.status === 'returned' ? 'warn' : 'ok'} />
          {o.events.map((e, i) => (
            <Text key={i} style={styles.muted}>
              {formatTime(e.at)} · {e.text}
            </Text>
          ))}
        </View>

        <View style={[styles.card, { gap: 4 }]}>
          {o.items.map((it) => {
            const p = products.find((x) => x.id === it.productId);
            const reported = myIssues.filter((x) => x.productId === it.productId);
            const isOpen = openItem === it.productId;
            return (
              <View key={it.id ?? it.productId} style={{ gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0EEE7' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.body}>{p?.name}</Text>
                    <Text style={styles.muted}>
                      {p ? formatQty(p, lineQty(it)) : lineQty(it)} · {formatAmd(linePrice(it))}
                    </Text>
                    <ItemChange item={it} unit={p?.unit} />
                  </View>
                  {o.status === 'delivered' ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => { setOpenItem(isOpen ? null : it.productId); setMsg(null); }}
                      style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: 'center' }}>
                      <Text>Խնդիր</Text>
                    </Pressable>
                  ) : null}
                </View>
                {it.subStatus === 'proposed' && it.id ? (
                  <View style={{ gap: 8, backgroundColor: '#FBF3EC', borderRadius: radius.md, padding: 10 }}>
                    <Text style={styles.body}>
                      🔄 Մատակարարը առաջարկում է փոխարինել՝ <Text style={styles.strong}>{products.find((x) => x.id === it.subProductId)?.name}</Text> × {it.subQty}
                      {products.find((x) => x.id === it.subProductId) ? ` · ${formatAmd(products.find((x) => x.id === it.subProductId)!.price)}` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button kind="outline" label="❌ Ոչ" onPress={() => answer(it.id!, false)} style={{ flex: 1 }} />
                      <Button label="✅ Համաձայն եմ" onPress={() => answer(it.id!, true)} style={{ flex: 1 }} />
                    </View>
                  </View>
                ) : null}
                {reported.map((r) => (
                  <Pill key={r.id} tone="warn" text={`${issueLabel[r.kind]}${r.qty ? ` · ${r.qty}` : ''} · ուղարկված է`} />
                ))}
                {isOpen ? (
                  <View style={{ gap: 8, backgroundColor: '#FBF3EC', borderRadius: radius.md, padding: 12 }}>
                    <Chips options={(Object.keys(issueLabel) as IssueKind[]).map((k) => ({ value: k, label: issueLabel[k] }))} value={kind} onChange={setKind} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput placeholderTextColor={colors.textMuted} importantForAutofill="no" accessibilityLabel="Քանակ" placeholder="Քանակ" value={qty} onChangeText={(v) => setQty(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" style={input} />
                      <TextInput placeholderTextColor={colors.textMuted} importantForAutofill="no" accessibilityLabel="Նշում" placeholder="Նշում (ըստ ցանկության)" value={note} onChangeText={setNote} style={[input, { flex: 1 }]} />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={async () => {
                        const r = await pickAndUpload(`shop/${o.shopId}`);
                        if (r.url) setPhoto(r.url);
                        if (r.error) setMsg(r.error);
                      }}
                      style={{ minHeight: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
                      <Text>{photo ? '📷 Լուսանկարը կցված է ✓' : '📷 Կցել լուսանկար'}</Text>
                    </Pressable>
                    <Button
                      label="Ուղարկել մենեջերին և վարորդին"
                      onPress={async () => {
                        const err = await reportIssue(o.id, it.productId, kind, qty ? Number(qty) : null, note, photo);
                        setMsg(err);
                        if (!err) { setOpenItem(null); setQty(''); setNote(''); setPhoto(undefined); }
                      }}
                    />
                    {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <Text style={[styles.strong, { textAlign: 'right' }]}>Ընդամենը՝ {formatAmd(total)}</Text>
        {msg && !openItem ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
        <Button
          kind="dark"
          label="Կրկնել պատվերը"
          onPress={() => {
            repeatOrder(o);
            router.push('/shop/cart');
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const input = {
  minHeight: 44,
  minWidth: 80,
  borderWidth: 1,
  borderColor: colors.borderStrong,
  borderRadius: radius.sm,
  paddingHorizontal: 10,
  backgroundColor: colors.card,
  color: colors.text,
} as const;
