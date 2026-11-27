// Խանութի քարտ (ֆիրմայի կողմից). վերջին 30 օրվա ամփոփում, պայմաններ (զեղչ, սահմանաչափ, գիծ, մենեջեր), վերջին պատվերներ
// Ղեկավարը փոխում է ամեն ինչ, մենեջերը՝ իր խանութի պայմանները (թույլտվությունները՝ բազայում)
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { formatAmd, formatDayTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { shopStatusLabel, type Order, type Perm } from '@/lib/types';
import { Button, Card, Chips, Field, Screen, styles, Title } from '@/lib/ui';

const orderTotal = (o: Order) => o.items.reduce((s, i) => s + (i.actualQty ?? i.qty) * (i.price ?? 0), 0);

export default function FirmShopCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, employees, shops, links, lines, orders, payments, debts, perms, setLinkTerms, setLinkLine, setLinkManager, setLinkBlocked } = useStore();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    supabase.from('link_block_notes').select('reason').eq('shop_id', id).maybeSingle().then(({ data }) => setNote(data?.reason ?? null));
  }, [id, links]);
  const can = (p: Perm) => perms.includes(p);
  const [discount, setDiscount] = useState<string | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const me = session?.kind === 'employee' ? employees.find((e) => e.id === session.employeeId) : undefined;
  if (!me) return <Redirect href="/" />;
  const shop = shops.find((s) => s.id === id);
  const link = links.find((l) => l.shopId === id && l.firmId === me.firmId);
  if (!shop || !link) return null;
  const isAdmin = me.role === 'admin';

  const since = Date.now() - 30 * 86400000;
  const mine = orders.filter((o) => o.shopId === id && o.firmId === me.firmId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const month = mine.filter((o) => new Date(o.createdAt).getTime() >= since && o.status !== 'returned');
  const ordered = month.reduce((s, o) => s + orderTotal(o), 0);
  const paid = payments.filter((p) => p.shopId === id && p.firmId === me.firmId && p.confirmed && p.markedAt && new Date(p.markedAt).getTime() >= since).reduce((s, p) => s + p.amount, 0);
  const debt = debts.find((d) => d.shopId === id && d.firmId === me.firmId)?.debt ?? 0;
  const run = async (p: Promise<string | null>) => setMsg(await p);

  const d = discount ?? String(link.discountPct ?? 0);
  const lim = limit ?? (link.creditLimit != null ? String(link.creditLimit) : '');

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub={[shop.district, shop.address].filter(Boolean).join(', ')}>{shop.name}</Title>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
        {shop.phone ? (
          <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${shop.phone}`)}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>📞 {shop.phone}{shop.contactPerson ? ` · ${shop.contactPerson}` : ''}</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.strong, { color: colors.textMuted, fontSize: 14 }]}>Վերջին 30 օր</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            ['Պատվիրել է', ordered],
            ['Վճարել է', paid],
            ['Պարտք', debt],
          ].map(([k, v]) => (
            <Card key={k as string} style={{ flex: 1, gap: 2 }}>
              <Text style={styles.muted}>{k}</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: k === 'Պարտք' && Number(v) > 0 ? colors.dark : colors.text }}>{formatAmd(Number(v))}</Text>
            </Card>
          ))}
        </View>

        <Card style={{ gap: 10 }}>
          <Text style={styles.strong}>Պայմաններ</Text>
          {can('shop_terms') ? (
          <>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field label="Զեղչ, %" value={d} onChangeText={(v) => setDiscount(v.replace(/[^\d.]/g, '').slice(0, 5))} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Պարտքի սահմանաչափ, ֏" value={lim} onChangeText={(v) => setLimit(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Չկա" />
            </View>
          </View>
          <Button
            label="Պահել պայմանները"
            disabled={(discount === null && limit === null) || Number(d) > 100}
            onPress={async () => {
              await run(setLinkTerms(id, me.firmId, Number(d) || 0, lim ? Number(lim) : null));
              setDiscount(null);
              setLimit(null);
            }}
          />
          </>
          ) : (
            <Text style={styles.body}>
              Զեղչ՝ {link.discountPct ?? 0}% · սահմանաչափ՝ {link.creditLimit != null ? formatAmd(link.creditLimit) : 'չկա'}
            </Text>
          )}
          {can('lines') || can('shop_terms') ? (
          <>
          <Text style={styles.muted}>Գիծ (առաքման օրեր)</Text>
          <Chips
            options={[{ value: 'none', label: 'Առանց գծի' }, ...lines.filter((x) => x.firmId === me.firmId).map((x) => ({ value: x.id, label: x.name }))]}
            value={link.lineId ?? 'none'}
            onChange={(v) => run(setLinkLine(id, me.firmId, v === 'none' ? null : v))}
          />
          </>
          ) : null}
          {isAdmin && employees.some((e) => e.firmId === me.firmId && e.role === 'manager') ? (
            <>
              <Text style={styles.muted}>Մենեջեր</Text>
              <Chips
                options={employees.filter((e) => e.firmId === me.firmId && e.role === 'manager').map((m) => ({ value: m.id, label: m.name }))}
                value={link.managerId}
                onChange={(v) => run(setLinkManager(id, me.firmId, v))}
              />
            </>
          ) : null}
          {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
        </Card>

        {/* ⛔ Սև ցուցակ. խանութը չի կարող պատվիրել (միայն վճարել); պատճառը տեսնում է միայն ֆիրման */}
        {can('blacklist') || link.blocked ? (
          <Card style={{ gap: 8, borderColor: link.blocked ? colors.warnText : colors.border }}>
            <Text style={styles.strong}>{link.blocked ? '⛔ Սև ցուցակում է' : '⛔ Սև ցուցակ'}</Text>
            {link.blocked && note ? <Text style={styles.body}>Պատճառը՝ {note}</Text> : null}
            {can('blacklist') ? (
              link.blocked ? (
                <Button kind="outline" label="✅ Հանել սև ցուցակից" onPress={() => run(setLinkBlocked(id, me.firmId, false, null))} />
              ) : (
                <>
                  <Field label="Պատճառը (տեսնում է միայն ֆիրման)" value={reason} onChangeText={setReason} autoComplete="off" />
                  <Button kind="outline" label="⛔ Ավելացնել սև ցուցակ" disabled={!reason.trim()} onPress={() => run(setLinkBlocked(id, me.firmId, true, reason.trim()))} />
                </>
              )
            ) : null}
          </Card>
        ) : null}

        <Text style={[styles.strong, { color: colors.textMuted, fontSize: 14 }]}>Վերջին պատվերներ</Text>
        {mine.length === 0 ? <Text style={styles.muted}>Պատվեր դեռ չկա</Text> : null}
        {mine.slice(0, 15).map((o) => (
          <View key={o.id} style={[styles.card, { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 10 }]}>
            <Text style={styles.body}>{formatDayTime(o.createdAt)}</Text>
            <Text style={styles.muted}>{shopStatusLabel[o.status]}</Text>
            <Text style={styles.strong}>{formatAmd(orderTotal(o))}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
