// Վարորդ. միայն ուր գնալ և ինչ տանել (docs/SPEC.md §7.4)։ Աշխատում է առանց ինտերնետի։
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { applyOutbox, loadOutbox, openRoute, saveOutbox, syncOutbox, type DriverAction } from '@/lib/driver-offline';
import { driverDays, earlierThanUsualMin, type FinishedDayRow } from '@/lib/driver-stats';
import { currentPoint } from '@/lib/geo';
import { orderByNearest } from '@/lib/route';
import { formatQty, formatTime, toISODate, placeLine } from '@/lib/rules';
import { ChatButton, PlatformLink } from '@/components/chat-button';
import { VerificationBanner } from '@/components/verification-banner';
import { InviteButton } from '@/components/invite-button';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Button, Screen, styles } from '@/lib/ui';

export default function DriverStops() {
  const { session, employees, orders, shops, products, firms, reload, signOut } = useStore();
  const [uid, setUid] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<DriverAction[]>([]);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [finishedRows, setFinishedRows] = useState<FinishedDayRow[]>([]);
  const [checkedInServer, setCheckedInServer] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id ?? null;
      setUid(id);
      if (id) loadOutbox(id).then(setOutbox);
    });
  }, []);

  // Փորձում ենք ուղարկել հերթը և թարմացնել տվյալները. սկզբում և ամեն 20 վայրկյանը մեկ
  const loadFinished = useCallback(async () => {
    if (!uid) return;
    const cacheKey = `driver-days:${uid}`;
    const { data, error } = await supabase.from('driver_days').select('day, finished_at, km_estimate').order('day', { ascending: false }).limit(14);
    const ci = await supabase.from('driver_checkins').select('day').eq('day', toISODate(new Date())).maybeSingle();
    if (!ci.error) setCheckedInServer(!!ci.data);
    if (!error && data) {
      setFinishedRows(data as FinishedDayRow[]);
      AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
    } else {
      const raw = await AsyncStorage.getItem(cacheKey).catch(() => null);
      if (raw) setFinishedRows(JSON.parse(raw));
    }
  }, [uid]);

  const sync = useCallback(async () => {
    if (!uid) return;
    const left = await syncOutbox(uid);
    setOutbox(left);
    const ping = await supabase.from('orders').select('id', { head: true, count: 'exact' });
    const ok = !ping.error && left.length === 0;
    setOnline(!ping.error);
    if (ok) {
      await reload();
      await loadFinished();
      setLastSync(new Date().toISOString());
    }
  }, [uid, reload, loadFinished]);

  useEffect(() => {
    sync();
    const t = setInterval(sync, 20000);
    return () => clearInterval(t);
  }, [sync]);

  const me = session?.kind === 'employee' ? employees.find((e) => e.id === session.employeeId) : undefined;

  const withOutbox = useMemo(() => (me ? applyOutbox(orders, outbox, me.name) : orders), [orders, outbox, me]);
  const stops = useMemo(() => {
    if (!me) return [];
    const mine = withOutbox.filter((o) => o.driverId === me.id && ['preparing', 'on_the_way', 'delivered'].includes(o.status));
    // Ավտոմատ հերթականություն. ֆիրմայի բազայից՝ ամենամոտիկից դեպի հեռու
    const firm = firms.find((f) => f.id === me.firmId);
    const base = firm?.baseLat != null && firm?.baseLng != null ? { lat: firm.baseLat, lng: firm.baseLng } : null;
    const pointOf = (o: (typeof mine)[number]) => {
      const s = shops.find((x) => x.id === o.shopId);
      return s?.lat != null && s?.lng != null ? { lat: s.lat, lng: s.lng } : null;
    };
    const onWay = mine.filter((o) => o.status === 'on_the_way');
    const waiting = orderByNearest(mine.filter((o) => o.status === 'preparing'), pointOf, base);
    const delivered = mine.filter((o) => o.status === 'delivered');
    return [...onWay, ...waiting, ...delivered];
  }, [withOutbox, me, firms, shops]);

  if (session?.kind !== 'employee' || !me) return <Redirect href="/" />;

  // Օրվա ամփոփում (ներառյալ չուղարկված գործողությունները)
  const localFinished: FinishedDayRow[] = outbox
    .filter((a): a is Extract<DriverAction, { kind: 'finish' }> => a.kind === 'finish')
    .map((a) => ({ day: a.day, finished_at: a.at, km_estimate: a.km }));
  const days = driverDays(withOutbox, me.name, [...localFinished, ...finishedRows]);
  const today = days[0];
  const vsUsual = earlierThanUsualMin(today, days.slice(1).filter((d) => d.stops > 0));
  const checkedIn = checkedInServer || outbox.some((a) => a.kind === 'checkin' && a.day === today.day);

  const open = stops.filter((o) => o.status !== 'delivered');
  const done = stops.filter((o) => o.status === 'delivered' && o.events.some((e) => e.text === 'Առաքեց' && toISODate(new Date(e.at)) === today.day));
  const current = open.find((o) => o.id === pickedId) ?? open[0];
  const shop = current ? shops.find((s) => s.id === current.shopId) : undefined;
  const manager = current ? employees.find((e) => e.id === current.managerId) : undefined;

  const act = async (status: 'on_the_way' | 'delivered') => {
    if (!uid || !current) return;
    const at = new Date().toISOString();
    const p = await currentPoint(); // տեղը՝ միայն այս պահին (կիլոմետրաժի համար)
    const next: DriverAction[] = [...outbox, { id: `${Date.now()}`, orderId: current.id, status, at, lat: p?.lat, lng: p?.lng }];
    setOutbox(next);
    await saveOutbox(uid, next);
    if (status === 'delivered') setPickedId(null);
    sync();
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ gap: 2 }}>
          <Text style={styles.muted}>Վարորդ · {me.name}</Text>
          <Text style={styles.title}>
            Այսօր՝ {done.length} / {done.length + open.length}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <PlatformLink />
          <ChatButton />
          <InviteButton />
          <Pressable accessibilityRole="button" onPress={() => { signOut(); router.replace('/'); }} hitSlop={12}>
          <Text style={styles.muted}>Դուրս գալ</Text>
        </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: online ? colors.primary : colors.accent }} />
        <Text style={styles.muted}>
          {online ? 'Կապ կա' : 'Առանց ինտերնետի · տվյալները պահված են հեռախոսում'}
          {outbox.length ? ` · չուղարկված՝ ${outbox.length}` : ''}
          {lastSync ? ` · ${formatTime(lastSync)}` : ''}
        </Text>
      </View>

      <VerificationBanner />
      {!checkedIn ? (
        <View style={[styles.card, { gap: 10, marginBottom: 10, borderColor: '#2E9E5B' }]}>
          <Text style={styles.strong}>Բարի լույս, {me.name} 👋</Text>
          <Text style={styles.muted}>Սեղմեք, որ մենեջերները տեսնեն, որ այսօր գործի եք</Text>
          <Button
            label="Գործի եմ"
            onPress={async () => {
              if (!uid) return;
              const next: DriverAction[] = [...outbox, { kind: 'checkin', id: `${Date.now()}`, driverId: me.id, firmId: me.firmId, day: today.day, at: new Date().toISOString() }];
              setOutbox(next);
              await saveOutbox(uid, next);
              sync();
            }}
          />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {current && shop ? (
          <View style={{ backgroundColor: colors.dark, borderRadius: 20, padding: 16, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>{shop.name}</Text>
                <Text style={{ color: colors.onDarkMuted, fontSize: 13 }}>
                  {placeLine(shop.district, shop.address, ' · ')}
                </Text>
              </View>
              {shop.phone ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Զանգել խանութին"
                  onPress={() => Linking.openURL(`tel:${shop.phone}`)}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.darkSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16 }}>📞</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={{ backgroundColor: colors.darkSoft, borderRadius: radius.md, paddingHorizontal: 14 }}>
              {current.items.map((it, i) => {
                const p = products.find((x) => x.id === it.productId);
                return (
                  <View
                    key={it.productId}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: '#8F3D55' }}>
                    <Text style={{ color: '#FFFFFF', flex: 1, fontSize: 15 }}>{p?.name ?? 'Ապրանք'}</Text>
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>{p ? formatQty(p, it.qty) : it.qty}</Text>
                  </View>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button kind="outline" label="Ճանապարհ" onPress={() => openRoute(shop)} style={{ flex: 1 }} />
              {current.status === 'preparing' ? (
                <Button label="Մեկնեցի" onPress={() => act('on_the_way')} style={{ flex: 1 }} />
              ) : (
                <Button label="Առաքված ✓" onPress={() => act('delivered')} style={{ flex: 1 }} />
              )}
            </View>
            {manager?.phone ? (
              <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${manager.phone}`)} hitSlop={8}>
                <Text style={{ color: colors.onDarkMuted, textAlign: 'center' }}>Խնդիր կա · զանգել մենեջերին ({manager.name})</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={[styles.card, { gap: 10 }]}>
            {today.finishedAt ? (
              <>
                <Text style={styles.strong}>Օրն ավարտված է {formatTime(today.finishedAt)}-ին ✓</Text>
                <Text style={styles.body}>
                  {today.stops} կանգառ
                  {today.startedAt ? ` · ${formatTime(today.startedAt)}–${formatTime(today.finishedAt)}` : ''}
                  {today.km != null ? ` · մոտ ${today.km} կմ` : ''}
                </Text>
                {vsUsual != null && Math.abs(vsUsual) >= 10 ? (
                  <Text style={{ color: vsUsual > 0 ? colors.primary : colors.warnText, fontWeight: '600' }}>
                    {vsUsual > 0 ? `Այսօր ավարտեցիք ${vsUsual} րոպե ավելի շուտ, քան սովորաբար 👏` : `Այսօր ավարտեցիք ${-vsUsual} րոպե ավելի ուշ, քան սովորաբար`}
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.strong}>{done.length ? 'Բոլոր կանգառներն ավարտված են 🎉' : 'Այսօր պատվեր չկա'}</Text>
                <Text style={styles.muted}>Նոր պատվերները կհայտնվեն, երբ կապ լինի</Text>
                {done.length ? (
                  <Button
                    kind="dark"
                    label="Ավարտել օրը"
                    onPress={async () => {
                      if (!uid) return;
                      const next: DriverAction[] = [
                        ...outbox,
                        {
                          kind: 'finish',
                          id: `${Date.now()}`,
                          driverId: me.id,
                          firmId: me.firmId,
                          day: today.day,
                          at: new Date().toISOString(),
                          startedAt: today.startedAt,
                          stops: today.stops,
                          km: today.km,
                        },
                      ];
                      setOutbox(next);
                      await saveOutbox(uid, next);
                      sync();
                    }}
                  />
                ) : null}
              </>
            )}
          </View>
        )}

        <Button kind="outline" label="Պատմություն · վերջին 7 օր" onPress={() => router.push('/driver/history')} />

        {open.length > 1 ? <Text style={[styles.strong, { fontSize: 15, marginTop: 6 }]}>Հաջորդ կանգառները</Text> : null}
        {open
          .filter((o) => o.id !== current?.id)
          .map((o) => {
            const s = shops.find((x) => x.id === o.shopId);
            return (
              <Pressable
                key={o.id}
                accessibilityRole="button"
                onPress={() => setPickedId(o.id)}
                style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                <Text style={[styles.strong, { flex: 1 }]}>{s?.name}</Text>
                <Text style={styles.muted}>{o.status === 'on_the_way' ? 'Ճանապարհին' : `${o.items.length} ապրանք`}</Text>
              </Pressable>
            );
          })}

        {done.length ? <Text style={[styles.strong, { fontSize: 15, marginTop: 6 }]}>Առաքված</Text> : null}
        {done.map((o) => (
          <View key={o.id} style={[styles.card, { opacity: 0.6, flexDirection: 'row', justifyContent: 'space-between' }]}>
            <Text style={styles.body}>{shops.find((x) => x.id === o.shopId)?.name}</Text>
            <Text style={styles.muted}>✓</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
