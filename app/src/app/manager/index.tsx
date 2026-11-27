// Մենեջեր և ներքին աշխատողներ (օֆիս, առաքման բաժին, պահեստ, հաշվապահ)
// Մենեջեր՝ Պատվերներ · Հայտեր · Իմ խանութները
// Ներքին աշխատող՝ Պատվերներ · Վճարումներ
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ForwardPicker } from '@/components/forward-picker';
import { deliveryLabel, formatAmd, formatDayTime, formatQty, formatTime } from '@/lib/rules';
import { ChatButton, PlatformLink } from '@/components/chat-button';
import { InviteButton } from '@/components/invite-button';
import { districts } from '@/lib/districts';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { issueLabel, type Order } from '@/lib/types';
import { Button, Chips, CopyRow, Pill, Screen, styles, Title } from '@/lib/ui';

const dayShort = ['', 'երկ', 'երք', 'չրք', 'հնգ', 'ուրբ', 'շբթ', 'կիր'];
type Tab = 'orders' | 'requests' | 'shops' | 'payments';

export default function Inbox() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>('orders');
  if (s.session?.kind !== 'employee') return <Redirect href="/" />;
  const me = s.employees.find((e) => e.id === (s.session as { employeeId: string }).employeeId);
  if (!me) return <Redirect href="/" />;
  const firm = s.firms.find((f) => f.id === me.firmId)!;
  const isManager = me.role === 'manager';
  // Ունի՞ ֆիրման ուրիշ աշխատողներ / վարորդներ, որոնց կարելի է փոխանցել
  const hasTeam = s.employees.some((e) => e.firmId === me.firmId && e.id !== me.id && (e.role === 'staff' || e.role === 'driver'));
  const roleLabel = isManager ? 'մենեջեր' : me.department ?? 'աշխատող';

  // Մենեջեր՝ իր խանութների նոր պատվերները; ներքին աշխատող՝ իրեն փոխանցվածները
  const open = (st: string) => st === 'sent' || st === 'accepted' || (!hasTeam && (st === 'preparing' || st === 'on_the_way'));
  const waiting = isManager
    ? s.orders.filter((o) => o.managerId === me.id && open(o.status))
    : s.orders.filter((o) => o.assigneeId === me.id && o.status === 'preparing');
  const done = isManager
    ? s.orders.filter((o) => o.managerId === me.id && !open(o.status))
    : s.orders.filter((o) => o.assigneeId !== me.id && o.events.some((ev) => ev.byName === me.name));
  const requests = s.links.filter((l) => l.firmId === me.firmId && l.status === 'pending');
  const myLinks = s.links.filter((l) => l.managerId === me.id && l.status === 'active');
  const pendingPayments = s.payments.filter((p) => p.firmId === me.firmId && !p.confirmed);
  // Գրված / թելադրված պատվերներ իմ խանութներից (ղեկավարը տեսնում է բոլորը)
  const textOrders = s.textOrders.filter((t) => t.status === 'new' && t.firmId === me.firmId && (t.managerId === me.id || me.role === 'admin'));
  const recentIssues = s.issues.filter((i) => s.orders.some((o) => o.id === i.orderId) && Date.now() - new Date(i.createdAt).getTime() < 3 * 86400000);

  const tabs: { value: Tab; label: string; hint?: string }[] = isManager
    ? [
        { value: 'orders', label: 'Պատվերներ', hint: `${waiting.length + textOrders.length}` },
        { value: 'requests', label: 'Հայտեր', hint: requests.length ? `${requests.length}` : undefined },
        { value: 'shops', label: 'Իմ խանութները' },
      ]
    : [
        { value: 'orders', label: 'Պատվերներ', hint: `${waiting.length}` },
        { value: 'payments', label: 'Վճարումներ', hint: pendingPayments.length ? `${pendingPayments.length}` : undefined },
      ];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.dark }}>Մատակարար</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <PlatformLink />
          <ChatButton />
          <InviteButton />
          <Pressable accessibilityRole="button" onPress={() => { s.signOut(); router.replace('/'); }} hitSlop={12}>
          <Text style={styles.muted}>Դուրս գալ</Text>
        </Pressable>
        </View>
      </View>
      <Title sub={`${firm.name} · ${roleLabel}`}>Բարև, {me.name}</Title>
      <View style={{ marginBottom: 12, gap: 8 }}>
        <Chips options={tabs} value={tab} onChange={setTab} />
        {isManager ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/firm/drivers')} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>🔍 Գտնել վարորդ →</Text>
          </Pressable>
        ) : null}
        {isManager ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/firm/requests')} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>📣 Խանութները փնտրում են մատակարար →</Text>
          </Pressable>
        ) : null}
        {me.role === 'staff' || (isManager && firm.status === 'unclaimed') ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/firm/products')} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Ապրանքներ և գներ →</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {tab === 'orders' ? (
          <>
            {recentIssues.map((i) => {
              const o = s.orders.find((x) => x.id === i.orderId)!;
              return (
                <View key={i.id} style={{ backgroundColor: '#FBF3EC', borderColor: '#F1D9C6', borderWidth: 1, borderRadius: radius.md, padding: 12 }}>
                  <Text style={{ color: colors.warnText, fontWeight: '600' }}>
                    ⚠️ {s.shops.find((x) => x.id === o.shopId)?.name} · {s.products.find((p) => p.id === i.productId)?.name} · {i.qty ? `${i.qty} ` : ''}
                    {issueLabel[i.kind].toLowerCase()}
                  </Text>
                  {i.note ? <Text style={styles.muted}>{i.note}</Text> : null}
                  {i.photoUrl ? <Image source={{ uri: i.photoUrl }} style={{ width: 120, height: 90, borderRadius: 8, marginTop: 6 }} contentFit="cover" accessibilityLabel="Խնդրի լուսանկար" /> : null}
                </View>
              );
            })}
            {textOrders.map((t) => (
              <View key={t.id} style={[styles.card, { gap: 8, borderColor: colors.primary }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[styles.strong, { flex: 1 }]}>📝 {s.shops.find((x) => x.id === t.shopId)?.name}</Text>
                  <Text style={styles.muted}>{formatDayTime(t.createdAt)}</Text>
                </View>
                <Text style={[styles.body, { fontSize: 16 }]}>{t.text}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button kind="outline" label="Արված է ✓" onPress={() => s.finishTextOrder(t.id)} style={{ flex: 1 }} />
                  <Button label="Ձևակերպել" onPress={() => router.push(`/manager/new-order/${t.shopId}?text=${t.id}`)} style={{ flex: 1 }} />
                </View>
              </View>
            ))}
            <Text style={[styles.strong, { fontSize: 15 }]}>Նոր պատվերներ · {waiting.length}</Text>
            {waiting.length === 0 ? <Text style={styles.muted}>Նոր պատվեր չկա</Text> : null}
            {waiting.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                withInvoice={!isManager || !hasTeam}
                action={
                  isManager && o.status === 'sent' ? (
                    <Button label="Ընդունել" onPress={() => s.accept(o.id)} />
                  ) : hasTeam ? (
                    <ForwardPicker order={o} />
                  ) : (
                    // Ֆիրման դեռ վարորդներ / աշխատողներ չունի հավելվածում → մենեջերը ինքն է նշում
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button kind="outline" label="Ճանապարհին" onPress={() => s.setStatus(o.id, 'on_the_way')} style={{ flex: 1 }} />
                      <Button label="Առաքված ✓" onPress={() => s.setStatus(o.id, 'delivered')} style={{ flex: 1 }} />
                    </View>
                  )
                }
              />
            ))}
            {done.length > 0 ? <Text style={[styles.strong, { fontSize: 15, marginTop: 8 }]}>Փոխանցված</Text> : null}
            {done.slice(0, 20).map((o) => (
              <View key={o.id} style={[styles.card, { gap: 6 }]}>
                <Text style={styles.strong}>{s.shops.find((x) => x.id === o.shopId)?.name}</Text>
                <Pill text={o.events[o.events.length - 1]?.text ?? ''} tone="ok" />
              </View>
            ))}
          </>
        ) : null}

        {tab === 'requests'
          ? requests.length === 0
            ? <Text style={styles.muted}>Նոր հայտ չկա</Text>
            : requests.map((l) => <JoinRequest key={l.shopId} shopId={l.shopId} />)
          : null}

        {tab === 'shops' ? (
          <View style={[styles.card, { gap: 8 }]}>
            <Text style={styles.strong}>Իմ թաղամասերը</Text>
            <Text style={styles.muted}>Այս թաղամասերի խանութների հայտերը կգան ձեզ, և խանութները որոնման մեջ ձեզ կտեսնեն որպես իրենց մենեջեր</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {districts.map((d) => {
                const on = (me.districts ?? []).includes(d);
                return (
                  <Pressable
                    key={d}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={async () => {
                      const next = on ? (me.districts ?? []).filter((x) => x !== d) : [...(me.districts ?? []), d];
                      await supabase.rpc('set_my_districts', { p_districts: next });
                      s.reload();
                    }}
                    style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? colors.dark : colors.card, borderWidth: 1, borderColor: on ? colors.dark : colors.borderStrong }}>
                    <Text style={{ color: on ? '#FFFFFF' : colors.text }}>{on ? '✓ ' : ''}{d}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Button kind="dark" label="🏪 Բոլոր խանութները (նոր հաճախորդներ)" onPress={() => router.push('/firm/shops')} />
          </View>
        ) : null}
        {tab === 'shops'
          ? myLinks.map((l) => {
              const shop = s.shops.find((x) => x.id === l.shopId);
              return (
                <View key={l.shopId} style={[styles.card, { gap: 8 }]}>
                  <Text style={styles.strong}>{shop?.name}</Text>
                  <Text style={styles.muted}>{[shop?.district, shop?.address].filter(Boolean).join(' · ')}</Text>
                  <Text style={styles.muted}>Գիծ՝</Text>
                  <Chips
                    options={s.lines.filter((x) => x.firmId === me.firmId).map((x) => ({ value: x.id, label: x.name, hint: x.deliveryDays.length ? x.deliveryDays.map((d) => dayShort[d]).join(', ') : 'ամեն օր' }))}
                    value={l.lineId ?? null}
                    onChange={(v) => s.setLinkLine(l.shopId, l.firmId, v)}
                  />
                  <Button kind="outline" label="Նոր պատվեր խանութի անունից" onPress={() => router.push(`/manager/new-order/${l.shopId}`)} />
                </View>
              );
            })
          : null}

        {tab === 'payments' ? (
          pendingPayments.length === 0 ? (
            <Text style={styles.muted}>Հաստատման սպասող վճարում չկա</Text>
          ) : (
            pendingPayments.map((p) => (
              <View key={p.id} style={[styles.card, { gap: 8 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.strong}>{s.shops.find((x) => x.id === p.shopId)?.name}</Text>
                  <Text style={styles.strong}>{formatAmd(p.amount)}</Text>
                </View>
                <Text style={styles.muted}>Խանութը նշել է «Վճարել եմ»{p.markedAt ? ` · ${new Date(p.markedAt).toLocaleDateString()}` : ''}</Text>
                <Button label="Գումարը ստացվել է ✓" onPress={() => s.confirmPayment(p.id)} />
              </View>
            ))
          )
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function OrderCard({ order: o, action, withInvoice }: { order: Order; action: React.ReactNode; withInvoice: boolean }) {
  const { shops, products, issues, setInvoice } = useStore();
  const [inv, setInv] = useState(o.invoiceNumber ?? '');
  const shop = shops.find((x) => x.id === o.shopId);
  const orderIssues = issues.filter((i) => i.orderId === o.id);
  return (
    <View style={[styles.card, { gap: 10 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={styles.strong}>{shop?.name}</Text>
        <Text style={styles.muted}>{formatTime(o.createdAt)}</Text>
      </View>
      <Text style={styles.muted}>
        {shop?.district} · առաքում՝ {deliveryLabel(new Date(o.deliveryDate + 'T00:00:00'))}
      </Text>
      {o.items.map((it) => {
        const p = products.find((x) => x.id === it.productId);
        return (
          <View key={it.productId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[styles.body, { flex: 1 }]}>{p?.name}</Text>
            <Text style={styles.muted}>{p ? formatQty(p, it.qty) : it.qty}</Text>
          </View>
        );
      })}
      {orderIssues.map((i) => (
        <Pill key={i.id} tone="warn" text={`${issueLabel[i.kind]}${i.qty ? ` · ${i.qty}` : ''}`} />
      ))}
      {withInvoice ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput importantForAutofill="no"
            accessibilityLabel="Ֆակտուրայի համար"
            placeholder="Ֆակտուրա №"
            value={inv}
            onChangeText={setInv}
            style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: 10, backgroundColor: colors.card, color: colors.text }}
          />
          <Button kind="outline" label="Պահել" disabled={!inv || inv === o.invoiceNumber} onPress={() => setInvoice(o.id, inv)} />
        </View>
      ) : null}
      {action}
    </View>
  );
}

function JoinRequest({ shopId }: { shopId: string }) {
  const { shops, lines, session, employees, acceptRequest } = useStore();
  const [line, setLine] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const shop = shops.find((x) => x.id === shopId);
  const me = employees.find((e) => session?.kind === 'employee' && e.id === session.employeeId);
  if (!shop) return null;
  return (
    <View style={[styles.card, { gap: 8 }]}>
      <Text style={styles.muted}>🆕 Միանալու հայտ</Text>
      <Text style={[styles.strong, { fontSize: 18 }]}>{shop.name}</Text>
      <CopyRow label="Անվանում" value={shop.legalName} />
      <CopyRow label="ՀՎՀՀ" value={shop.taxId} />
      <CopyRow label="Հասցե" value={[shop.city, shop.district, shop.address].filter(Boolean).join(', ')} />
      <CopyRow label="Հեռախոս" value={shop.phone} />
      <CopyRow label="Էլ. փոստ" value={shop.email} />
      <CopyRow label="Կոնտակտ" value={shop.contactPerson} />
      <Text style={styles.muted}>Գիծ՝</Text>
      <Chips options={lines.filter((x) => x.firmId === me?.firmId).map((x) => ({ value: x.id, label: x.name }))} value={line} onChange={setLine} />
      {err ? <Text style={{ color: colors.warnText }}>{err}</Text> : null}
      <Button label="Ընդունել" onPress={async () => setErr(await acceptRequest(shopId, line))} />
    </View>
  );
}
