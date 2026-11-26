// Վարորդի պատմություն. վերջին 7 օր (աշխատում է նաև առանց ինտերնետի՝ պահված տվյալներով)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { loadOutbox, applyOutbox, type DriverAction } from '@/lib/driver-offline';
import { dayLabel, driverDays, type FinishedDayRow } from '@/lib/driver-stats';
import { formatTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Screen, styles, Title } from '@/lib/ui';

export default function DriverHistory() {
  const { session, employees, orders, shops } = useStore();
  const [rows, setRows] = useState<FinishedDayRow[]>([]);
  const [outbox, setOutbox] = useState<DriverAction[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return;
      setOutbox(await loadOutbox(uid));
      const cacheKey = `driver-days:${uid}`;
      const { data, error } = await supabase.from('driver_days').select('day, finished_at, km_estimate').order('day', { ascending: false }).limit(14);
      if (!error && data) {
        setRows(data as FinishedDayRow[]);
        AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
      } else {
        const raw = await AsyncStorage.getItem(cacheKey).catch(() => null);
        if (raw) setRows(JSON.parse(raw));
      }
    })();
  }, []);

  const me = session?.kind === 'employee' ? employees.find((e) => e.id === session.employeeId) : undefined;
  if (!me) return <Redirect href="/" />;

  const local = outbox
    .filter((a): a is Extract<DriverAction, { kind: 'finish' }> => a.kind === 'finish')
    .map((a) => ({ day: a.day, finished_at: a.at, km_estimate: a.km }));
  const days = driverDays(applyOutbox(orders, outbox, me.name), me.name, [...local, ...rows]);
  const totalStops = days.reduce((s, d) => s + d.stops, 0);
  const totalKm = days.reduce((s, d) => s + (d.km ?? 0), 0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub={me.name}>Վերջին 7 օր</Title>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <View style={[styles.card, { flex: 1, gap: 2 }]}>
          <Text style={styles.muted}>Կանգառներ</Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>{totalStops}</Text>
        </View>
        <View style={[styles.card, { flex: 1, gap: 2 }]}>
          <Text style={styles.muted}>Մոտ կիլոմետր</Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>{Math.round(totalKm)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
        {days.map((d) => {
          const end = d.finishedAt ?? d.lastDeliveryAt;
          const expanded = open === d.day;
          return (
            <Pressable
              key={d.day}
              accessibilityRole="button"
              onPress={() => setOpen(expanded ? null : d.day)}
              style={[styles.card, { gap: 6, opacity: d.stops ? 1 : 0.55 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.strong}>{dayLabel(d.day)}</Text>
                <Text style={styles.muted}>{d.stops ? `${d.stops} կանգառ` : 'Առաքում չի եղել'}</Text>
              </View>
              {d.stops ? (
                <Text style={styles.body}>
                  {d.startedAt ? `${formatTime(d.startedAt)}–` : ''}
                  {end ? formatTime(end) : ''}
                  {d.finishedAt ? ' (ավարտված)' : ''}
                  {d.km != null ? ` · մոտ ${d.km} կմ` : ''}
                </Text>
              ) : null}
              {expanded
                ? d.shops.map((sid, i) => (
                    <Text key={`${sid}-${i}`} style={styles.muted}>
                      {i + 1}. {shops.find((s) => s.id === sid)?.name ?? 'Խանութ'}
                    </Text>
                  ))
                : null}
            </Pressable>
          );
        })}
        <Text style={[styles.muted, { textAlign: 'center' }]}>Կիլոմետրաժը մոտավոր է. հաշվվում է կանգառների միջև հեռավորությունից</Text>
      </ScrollView>
    </Screen>
  );
}
