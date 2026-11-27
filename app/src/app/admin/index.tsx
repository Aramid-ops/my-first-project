// Ղեկավար. կարգավորում է գծերը (վարորդ), խմբերը (անդամներ) և խանութները (մենեջեր, գիծ)։
// Պարզության կանոն. սա մեկ անգամ կարգավորվող էջ է, սովորական աշխատողը այն չի տեսնում։
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { formatAmd, normalizePhone, toISODate } from '@/lib/rules';
import { ChatButton, PlatformLink } from '@/components/chat-button';
import { InviteButton } from '@/components/invite-button';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { currentPoint } from '@/lib/geo';
import { pickAndUpload } from '@/lib/media';
import { LinesEditor, LinesExplainer } from '@/components/lines-editor';
import { ActivationCard } from '@/components/activation-card';
import { PaymentCard } from '@/components/payment-card';
import { Button, Card, Chips, CopyRow, Field, Logo, Screen, styles, Title } from '@/lib/ui';

const dayShort = ['', 'երկ', 'երք', 'չրք', 'հնգ', 'ուրբ', 'շբթ', 'կիր'];

export default function Admin() {
  const { session, employees, firms, shops, links, lines, teams, orders, issues, debts, payments, setLineDriver, setLineCutoff, toggleTeamMember, setLinkManager, setLinkLine, inviteEmployee, setLinkTerms, updateFirm, signOut, reload } = useStore();
  const [tab, setTab] = useState<'today' | 'lines' | 'teams' | 'shops' | 'people' | 'firm'>('today');
  const [inv, setInv] = useState<{ name: string; role: 'manager' | 'staff' | 'driver'; department: string; phone: string }>({ name: '', role: 'driver', department: '', phone: '' });
  const [code, setCode] = useState<{ code: string; phone: string; name: string } | null>(null);
  const [info, setInfo] = useState<{ description: string; phone: string; address: string; min: string } | null>(null);
  const [drivers, setDrivers] = useState<{ driver_id: string; name: string; checked_in: boolean; open_orders: number }[]>([]);
  useEffect(() => {
    if (tab === 'today') supabase.rpc('driver_load').then(({ data }) => setDrivers(data ?? []));
  }, [tab, orders]);
  const [error, setError] = useState<string | null>(null);
  if (session?.kind !== 'employee') return <Redirect href="/" />;
  const me = employees.find((e) => e.id === session.employeeId)!;
  const firm = firms.find((f) => f.id === me.firmId)!;
  const staff = employees.filter((e) => e.firmId === me.firmId && e.id !== me.id);
  const driverList = staff.filter((e) => e.role === 'driver');
  const managers = staff.filter((e) => e.role === 'manager');
  const firmLines = lines.filter((l) => l.firmId === me.firmId);
  const firmTeams = teams.filter((t) => t.firmId === me.firmId);
  const firmLinks = links.filter((l) => l.firmId === me.firmId);
  const run = async (p: Promise<string | null>) => setError(await p);
  const roleName = (r: string, d?: string) => d ?? ({ manager: 'մենեջեր', driver: 'վարորդ', staff: 'աշխատող', admin: 'ղեկավար' } as Record<string, string>)[r];

  // Նոր ֆիրմա. գործիքները բաց են միայն բանկային ստուգումից հետո
  if (firm.verified === false) {
    return (
      <Screen>
        <Title sub={`${firm.name} · ղեկավար`}>Բարի գալուստ</Title>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
          <ActivationCard code={firm.verificationCode} paidAt={firm.verificationPaidAt} />
          <Button kind="outline" label="Թարմացնել" onPress={() => reload()} />
          <Button kind="outline" label="Դուրս գալ" onPress={() => { signOut(); router.replace('/'); }} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.dark }}>Մատակարար</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <PlatformLink />
          <ChatButton />
          <InviteButton />
          <Pressable accessibilityRole="button" onPress={() => { signOut(); router.replace('/'); }} hitSlop={12}>
          <Text style={styles.muted}>Դուրս գալ</Text>
        </Pressable>
        </View>
      </View>
      <Title sub={`${firm.name} · ղեկավար`}>Կարգավորումներ</Title>

      <View style={{ marginBottom: 12 }}>
        <Chips
          options={[
            { value: 'today', label: 'Այսօր' },
            { value: 'lines', label: 'Գծեր' },
            { value: 'teams', label: 'Խմբեր' },
            { value: 'shops', label: 'Խանութներ' },
            { value: 'people', label: 'Աշխատողներ' },
            { value: 'firm', label: 'Ֆիրմա' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {error ? <Text style={{ color: colors.warnText, marginBottom: 8 }}>{error}</Text> : null}

      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {tab === 'today' ? (
          (() => {
            const today = toISODate(new Date());
            const fo = orders.filter((o) => o.firmId === me.firmId);
            const todayOrders = fo.filter((o) => toISODate(new Date(o.createdAt)) === today);
            const kpis = [
              { label: 'Պատվերներ այսօր', value: `${todayOrders.length}` },
              { label: 'Սպասում են մենեջերին', value: `${fo.filter((o) => o.status === 'sent').length}` },
              { label: 'Ընթացքում', value: `${fo.filter((o) => ['accepted', 'preparing', 'on_the_way'].includes(o.status)).length}` },
              { label: 'Առաքված այսօր', value: `${fo.filter((o) => o.status === 'delivered' && o.events.some((e) => e.text === 'Առաքեց' && toISODate(new Date(e.at)) === today)).length}` },
              { label: 'Խնդիրներ (3 օր)', value: `${issues.filter((i) => fo.some((o) => o.id === i.orderId) && Date.now() - new Date(i.createdAt).getTime() < 3 * 86400000).length}` },
              { label: 'Ընդհանուր պարտք', value: formatAmd(debts.filter((d) => d.firmId === me.firmId).reduce((a, d) => a + d.debt, 0)) },
            ];
            const pend = payments.filter((p) => p.firmId === me.firmId && !p.confirmed);
            return (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {kpis.map((k) => (
                    <View key={k.label} style={[styles.card, { flexGrow: 1, flexBasis: '45%', gap: 2 }]}>
                      <Text style={styles.muted}>{k.label}</Text>
                      <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{k.value}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.strong, { fontSize: 15, marginTop: 6 }]}>Մենեջերներ</Text>
                {managers.map((m) => (
                  <View key={m.id} style={[styles.card, { flexDirection: 'row', justifyContent: 'space-between' }]}>
                    <Text style={styles.strong}>{m.name}</Text>
                    <Text style={styles.muted}>
                      սպասում՝ {fo.filter((o) => o.managerId === m.id && o.status === 'sent').length} · այսօր՝ {todayOrders.filter((o) => o.managerId === m.id).length}
                    </Text>
                  </View>
                ))}
                <Text style={[styles.strong, { fontSize: 15, marginTop: 6 }]}>Վարորդներ</Text>
                {drivers.map((d) => (
                  <View key={d.driver_id} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.checked_in ? '#2E9E5B' : '#C9CCC6' }} />
                    <Text style={[styles.strong, { flex: 1 }]}>{d.name}</Text>
                    <Text style={styles.muted}>{d.checked_in ? 'գործի է' : 'դեռ ոչ'} · {d.open_orders} պատվեր</Text>
                  </View>
                ))}
                {pend.length ? <Text style={[styles.strong, { fontSize: 15, marginTop: 6 }]}>Վճարումներ՝ սպասում են հաստատման</Text> : null}
                {/* Ղեկավարը հաստատում է միայն եթե ինքն իրեն նշել է «հաստատում է վճարումներ» (Աշխատողներ ներդիր) */}
                {pend.map((p) => <PaymentCard key={p.id} payment={p} me={me} />)}
              </>
            );
          })()
        ) : null}

        {tab === 'people' ? (
          <>
            <Card style={{ gap: 10 }}>
              <Button kind="dark" label="🔐 Թույլտվություններ (ում ինչ կարելի է)" onPress={() => router.push('/firm/permissions')} />
              <Button kind="outline" label="🔍 Գտնել վարորդ հավելվածում" onPress={() => router.push('/firm/drivers')} />
              <Text style={styles.strong}>Նոր աշխատող (կոդով)</Text>
              <Field label="Անուն" value={inv.name} onChangeText={(v) => setInv({ ...inv, name: v })} />
              <Chips
                options={[{ value: 'manager', label: 'Մենեջեր' }, { value: 'staff', label: 'Ներքին աշխատող' }, { value: 'driver', label: 'Վարորդ' }]}
                value={inv.role}
                onChange={(v) => setInv({ ...inv, role: v as typeof inv.role })}
              />
              {inv.role === 'staff' ? <Field label="Բաժին (օր.՝ Պահեստ, Հաշվապահություն)" value={inv.department} onChangeText={(v) => setInv({ ...inv, department: v })} /> : null}
              <Field label="Հեռախոս" value={inv.phone} onChangeText={(v) => setInv({ ...inv, phone: v })} keyboardType="phone-pad" />
              <Button
                label="Ստանալ հրավերի կոդ"
                disabled={!inv.name.trim()}
                onPress={async () => {
                  const r = await inviteEmployee(inv.name.trim(), inv.role, inv.department, inv.phone);
                  setError(r.error ?? null);
                  if (r.code) { setCode({ code: r.code, phone: normalizePhone(inv.phone), name: inv.name.trim() }); setInv({ name: '', role: 'driver', department: '', phone: '' }); }
                }}
              />
              {code ? (
                <View style={{ backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, gap: 8 }}>
                  <Text style={styles.body}>Ուղարկեք կոդը {code.name}-ին{code.phone.length > 4 ? ` (${code.phone})` : ''}՝</Text>
                  {/* Հեռախոսի հաղորդագրությունը բացվում է պատրաստի տեքստով, մնում է սեղմել «Ուղարկել» */}
                  <InviteSend code={code.code} phone={code.phone} firm={firm.name} />
                  <CopyRow label="Կոդ (պահուստ)" value={code.code} />
                </View>
              ) : null}
            </Card>
            {[me, ...staff].map((e) => (
              <View key={e.id} style={[styles.card, { gap: 6 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={[styles.strong, { flex: 1 }]}>{e.name}{e.id === me.id ? ' (դուք)' : ''}</Text>
                  <Text style={styles.muted}>{roleName(e.role, e.department)}</Text>
                </View>

              </View>
            ))}
          </>
        ) : null}

        {tab === 'firm' ? (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Logo name={firm.name} uri={firm.logoUrl} bg={firm.color.bg} fg={firm.color.fg} size={64} />
              <Button
                kind="outline"
                label="Փոխել լոգոն"
                onPress={async () => {
                  const r = await pickAndUpload(`firm/${firm.id}`);
                  if (r.url) run(updateFirm({ logo_url: r.url }));
                  if (r.error) setError(r.error);
                }}
              />
            </View>
            {(() => {
              // Խանութները սա տեսնում են «Բոլոր մատակարարները» էջում
              const f = info ?? { description: firm.description ?? '', phone: firm.phone ?? '', address: firm.address ?? '', min: String(firm.minOrderAmount ?? 0) };
              const set = (k: keyof typeof f) => (v: string) => setInfo({ ...f, [k]: k === 'min' ? v.replace(/\D/g, '') : v });
              return (
                <>
                  <Field label="Մեր մասին (ինչ ենք մատակարարում, ինչ տարածքներում)" value={f.description} onChangeText={set('description')} autoComplete="off" />
                  <Field label="Հեռախոս" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
                  <Field label="Հասցե (պահեստ / գրասենյակ)" value={f.address} onChangeText={set('address')} autoComplete="off" />
                  <Field label="Նվազագույն պատվեր, ֏" value={f.min} onChangeText={set('min')} keyboardType="number-pad" />
                  <Button
                    label="Պահել"
                    disabled={info === null}
                    onPress={() => {
                      run(updateFirm({ description: f.description.trim() || null, phone: f.phone.replace(/\D/g, '').length > 3 ? normalizePhone(f.phone) : null, address: f.address.trim() || null, min_order_amount: Number(f.min || 0) }));
                      setInfo(null);
                    }}
                  />
                </>
              );
            })()}
            {/* Պահեստի տեղը՝ «մոտիկից» դասավորման և վարորդների երթուղու համար */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[styles.body, { flex: 1 }]}>{firm.baseLat != null ? '📍 Պահեստի տեղը նշված է ✓' : '📍 Պահեստի տեղը նշված չէ'}</Text>
              <Button
                kind="outline"
                label={firm.baseLat != null ? 'Թարմացնել' : 'Նշել'}
                onPress={async () => {
                  const p = await currentPoint();
                  if (!p) return setError('Չհաջողվեց որոշել տեղը. թույլ տվեք տեղորոշումը');
                  run(updateFirm({ base_lat: p.lat, base_lng: p.lng }));
                }}
              />
            </View>
            <Text style={styles.muted}>Սեղմեք, երբ գտնվում եք պահեստում։</Text>
            <Button kind="dark" label="Ապրանքներ →" onPress={() => router.push('/firm/products')} />
          </Card>
        ) : null}

        {tab === 'lines' ? (
          <>
            <LinesExplainer />
            <LinesEditor lines={firmLines} firmId={me.firmId} canCreate shopIds={firmLinks.map((l) => l.shopId)} />
          </>
        ) : null}

        {tab === 'teams'
          ? firmTeams.map((t) => (
              <View key={t.id} style={[styles.card, { gap: 8 }]}>
                <Text style={styles.strong}>{t.name}</Text>
                <Text style={styles.muted}>Սեղմեք՝ ավելացնելու կամ հանելու համար</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {staff.map((e) => {
                    const on = t.memberIds.includes(e.id);
                    return (
                      <Pressable
                        key={e.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        onPress={() => run(toggleTeamMember(t.id, e.id))}
                        style={{
                          minHeight: 40,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          justifyContent: 'center',
                          backgroundColor: on ? colors.primary : colors.card,
                          borderWidth: 1,
                          borderColor: on ? colors.primary : colors.borderStrong,
                        }}>
                        <Text style={{ color: on ? '#FFFFFF' : colors.text }}>
                          {on ? '✓ ' : ''}
                          {e.name} · {roleName(e.role, e.department)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          : null}

        {tab === 'shops' ? <Button kind="dark" label="🏪 Բոլոր խանութները (նոր հաճախորդներ)" onPress={() => router.push('/firm/shops')} /> : null}
        {tab === 'shops' ? <Button kind="outline" label="🟢 Live շուկա" onPress={() => router.push('/market')} /> : null}
        {tab === 'shops'
          ? // Խանութները՝ ըստ թաղամասերի. սեղմելով՝ խանութի քարտ (ամփոփում, պայմաններ, պատվերներ)
            [...new Set(firmLinks.map((l) => shops.find((x) => x.id === l.shopId)?.district || 'Առանց թաղամասի'))].sort().map((dist) => {
              const inDist = firmLinks.filter((l) => (shops.find((x) => x.id === l.shopId)?.district || 'Առանց թաղամասի') === dist);
              return (
                <View key={dist} style={{ gap: 6 }}>
                  <Text style={[styles.strong, { color: colors.textMuted, fontSize: 14, marginTop: 6 }]}>
                    {dist} · {inDist.length} խանութ
                  </Text>
                  {inDist.map((l) => {
                    const shop = shops.find((x) => x.id === l.shopId);
                    const debt = debts.find((d) => d.shopId === l.shopId && d.firmId === l.firmId)?.debt ?? 0;
                    return (
                      <Pressable
                        key={l.shopId}
                        accessibilityRole="button"
                        onPress={() => router.push(`/firm/shop/${l.shopId}`)}
                        style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.strong}>{shop?.name}</Text>
                          <Text style={styles.muted}>
                            {managers.find((m) => m.id === l.managerId)?.name ?? ''}
                            {l.discountPct ? ` · զեղչ ${l.discountPct}%` : ''}
                          </Text>
                        </View>
                        {debt > 0 ? <Text style={{ color: colors.dark, fontWeight: '700' }}>{formatAmd(debt)}</Text> : null}
                        <Text style={{ color: colors.textMuted }}>›</Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })
          : null}
      </ScrollView>
    </Screen>
  );
}

/** Հրավերի կոդը՝ SMS / WhatsApp / Viber-ով, պատրաստի տեքստով (ավտոմատ SMS՝ հետո, SMS ծառայությամբ) */
function InviteSend({ code, phone, firm }: { code: string; phone: string; firm: string }) {
  const text = `Բարև։ ${firm}-ը հրավիրում է ձեզ «Մատակարար» հավելված։ Բացեք հավելվածը → «Գրանցվել» → «Ֆիրմայի աշխատող» → կոդը՝ ${code}`;
  const t = encodeURIComponent(text);
  const digits = phone.replace(/\D/g, '');
  const has = digits.length > 4;
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <Button label="SMS" onPress={() => open(`sms:${has ? `+${digits}` : ''}${Platform.OS === 'ios' ? '&' : '?'}body=${t}`)} style={{ flex: 1 }} />
      <Button label="WhatsApp" onPress={() => open(has ? `https://wa.me/${digits}?text=${t}` : `https://wa.me/?text=${t}`)} style={{ flex: 1 }} />
      <Button label="Viber" onPress={() => open(`viber://forward?text=${t}`)} style={{ flex: 1 }} />
    </View>
  );
}
