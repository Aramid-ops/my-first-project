// Ղեկավար. կարգավորում է գծերը (վարորդ), խմբերը (անդամներ) և խանութները (մենեջեր, գիծ)։
// Պարզության կանոն. սա մեկ անգամ կարգավորվող էջ է, սովորական աշխատողը այն չի տեսնում։
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { formatAmd, normalizePhone, toISODate } from '@/lib/rules';
import { ChatButton, PlatformLink } from '@/components/chat-button';
import { InviteButton } from '@/components/invite-button';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { pickAndUpload } from '@/lib/media';
import { Button, Card, Chips, CopyRow, Field, Logo, Screen, styles, Title } from '@/lib/ui';

const dayShort = ['', 'երկ', 'երք', 'չրք', 'հնգ', 'ուրբ', 'շբթ', 'կիր'];

export default function Admin() {
  const { session, employees, firms, shops, links, lines, teams, orders, issues, debts, payments, setLineDriver, setLineCutoff, toggleTeamMember, setLinkManager, setLinkLine, confirmPayment, inviteEmployee, setLinkTerms, updateFirm, signOut } = useStore();
  const [tab, setTab] = useState<'today' | 'lines' | 'teams' | 'shops' | 'people' | 'firm'>('today');
  const [inv, setInv] = useState<{ name: string; role: 'manager' | 'staff' | 'driver'; department: string; phone: string }>({ name: '', role: 'driver', department: '', phone: '' });
  const [code, setCode] = useState<string | null>(null);
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
                {pend.map((p) => (
                  <View key={p.id} style={[styles.card, { gap: 8 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.strong}>{shops.find((x) => x.id === p.shopId)?.name}</Text>
                      <Text style={styles.strong}>{formatAmd(p.amount)}</Text>
                    </View>
                    <Button label="Գումարը ստացվել է ✓" onPress={() => run(confirmPayment(p.id))} />
                  </View>
                ))}
              </>
            );
          })()
        ) : null}

        {tab === 'people' ? (
          <>
            <Card style={{ gap: 10 }}>
              <Button kind="dark" label="🔍 Գտնել վարորդ հավելվածում" onPress={() => router.push('/firm/drivers')} />
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
                  if (r.code) { setCode(r.code); setInv({ name: '', role: 'driver', department: '', phone: '' }); }
                }}
              />
              {code ? (
                <View style={{ backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, gap: 4 }}>
                  <Text style={styles.body}>Հրավերի կոդը՝</Text>
                  <CopyRow label="Կոդ" value={code} />
                  <Text style={styles.muted}>Աշխատողը բացում է հավելվածը → «Գրանցվել» → «Աշխատող եմ» → գրում է այս կոդը</Text>
                </View>
              ) : null}
            </Card>
            {staff.map((e) => (
              <View key={e.id} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                <Text style={[styles.strong, { flex: 1 }]}>{e.name}</Text>
                <Text style={styles.muted}>{roleName(e.role, e.department)}</Text>
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
            <Button kind="dark" label="Ապրանքներ →" onPress={() => router.push('/firm/products')} />
          </Card>
        ) : null}

        {tab === 'lines'
          ? firmLines.map((l) => (
              <View key={l.id} style={[styles.card, { gap: 8 }]}>
                <Text style={styles.strong}>{l.name}</Text>
                <Text style={styles.muted}>
                  {l.deliveryDays.length ? l.deliveryDays.map((d) => dayShort[d]).join(', ') : 'ամեն օր'}
                  {l.teamId ? ` · ${firmTeams.find((t) => t.id === l.teamId)?.name ?? ''}` : ''}
                  {` · ${firmLinks.filter((x) => x.lineId === l.id).length} խանութ`}
                </Text>
                <Text style={styles.muted}>Վարորդ՝</Text>
                <Chips options={driverList.map((d) => ({ value: d.id, label: d.name }))} value={l.driverId ?? null} onChange={(v) => run(setLineDriver(l.id, v))} />
                <Text style={styles.muted}>Պատվերի վերջնաժամ (դրանից հետո՝ հաջորդ գծին)՝</Text>
                <Chips
                  options={[{ value: 'none', label: 'Չկա' }, ...['16:00', '17:00', '18:00', '19:00', '20:00'].map((t) => ({ value: t, label: t }))]}
                  value={l.orderCutoff ?? 'none'}
                  onChange={(v) => run(setLineCutoff(l.id, v === 'none' ? null : v))}
                />
              </View>
            ))
          : null}

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

        {tab === 'shops'
          ? firmLinks.map((l) => {
              const shop = shops.find((s) => s.id === l.shopId);
              return (
                <View key={l.shopId} style={[styles.card, { gap: 8 }]}>
                  <Text style={styles.strong}>{shop?.name}</Text>
                  <Text style={styles.muted}>{[shop?.district, shop?.address].filter(Boolean).join(' · ')}</Text>
                  <Text style={styles.muted}>Մենեջեր՝</Text>
                  <Chips options={managers.map((m) => ({ value: m.id, label: m.name }))} value={l.managerId} onChange={(v) => run(setLinkManager(l.shopId, l.firmId, v))} />
                  <Text style={styles.muted}>Գիծ՝</Text>
                  <Chips
                    options={firmLines.map((x) => ({ value: x.id, label: x.name }))}
                    value={l.lineId ?? null}
                    onChange={(v) => run(setLinkLine(l.shopId, l.firmId, v))}
                  />
                  <Text style={styles.muted}>Զեղչ՝</Text>
                  <Chips
                    options={['0', '3', '5', '7', '10', '15'].map((v) => ({ value: v, label: `${v}%` }))}
                    value={String(l.discountPct ?? 0)}
                    onChange={(v) => run(setLinkTerms(l.shopId, l.firmId, Number(v), l.creditLimit ?? null))}
                  />
                  <Text style={styles.muted}>Պարտքի սահմանաչափ՝</Text>
                  <Chips
                    options={[{ value: 'none', label: 'Չկա' }, ...['100000', '300000', '500000', '1000000'].map((v) => ({ value: v, label: formatAmd(Number(v)) }))]}
                    value={l.creditLimit != null ? String(l.creditLimit) : 'none'}
                    onChange={(v) => run(setLinkTerms(l.shopId, l.firmId, l.discountPct ?? 0, v === 'none' ? null : Number(v)))}
                  />
                </View>
              );
            })
          : null}
      </ScrollView>
    </Screen>
  );
}
