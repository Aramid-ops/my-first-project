// Պատվերի մանրամասներ. վիճակ, ապրանքներ, «Խնդիր» ամեն տողի կողքին, «Կրկնել պատվերը»
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { pickAndUpload } from '@/lib/media';
import { formatQty, formatTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors, radius } from '@/lib/theme';
import { issueLabel, shopStatusLabel, type IssueKind } from '@/lib/types';
import { Button, Chips, Pill, Screen, styles, Title } from '@/lib/ui';

export default function ShopOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, orders, firms, products, issues, reportIssue, repeatOrder } = useStore();
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
              <View key={it.productId} style={{ gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0EEE7' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.body}>{p?.name}</Text>
                    <Text style={styles.muted}>{p ? formatQty(p, it.actualQty ?? it.qty) : it.qty}</Text>
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
                {reported.map((r) => (
                  <Pill key={r.id} tone="warn" text={`${issueLabel[r.kind]}${r.qty ? ` · ${r.qty}` : ''} · ուղարկված է`} />
                ))}
                {isOpen ? (
                  <View style={{ gap: 8, backgroundColor: '#FBF3EC', borderRadius: radius.md, padding: 12 }}>
                    <Chips options={(Object.keys(issueLabel) as IssueKind[]).map((k) => ({ value: k, label: issueLabel[k] }))} value={kind} onChange={setKind} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput accessibilityLabel="Քանակ" placeholder="Քանակ" value={qty} onChangeText={(v) => setQty(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" style={input} />
                      <TextInput accessibilityLabel="Նշում" placeholder="Նշում (ըստ ցանկության)" value={note} onChangeText={setNote} style={[input, { flex: 1 }]} />
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
