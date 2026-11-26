// Գտնել վարորդ (ղեկավար / մենեջեր). ազատ վարորդներ՝ ֆիլտրերով → «Հրավիրել» մեկ սեղմումով կամ «Գրել»
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { openChat } from '@/lib/chat';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Button, Chips, Screen, styles, Title } from '@/lib/ui';

type Driver = { user_id: string; name: string; phone: string | null; license_categories: string[]; vehicle_type: string | null; vehicle_model: string | null; capacity_kg: number | null; refrigerated: boolean; district: string | null };
const vehicleLabel: Record<string, string> = { car: 'Մարդատար', van: 'Ֆուրգոն', truck: 'Բեռնատար' };

export default function FindDrivers() {
  const { session, employees } = useStore();
  const [list, setList] = useState<Driver[]>([]);
  const [minCap, setMinCap] = useState('0');
  const [fridge, setFridge] = useState<'any' | 'yes'>('any');
  const [invited, setInvited] = useState<Record<string, string>>({});
  const me = session?.kind === 'employee' ? employees.find((e) => e.id === session.employeeId) : undefined;
  useEffect(() => {
    supabase.rpc('available_drivers').then(({ data }) => setList((data ?? []) as Driver[]));
  }, []);
  if (!me || !(me.role === 'admin' || me.role === 'manager')) return <Redirect href="/" />;
  const shown = list.filter((d) => (d.capacity_kg ?? 0) >= Number(minCap) && (fridge === 'any' || d.refrigerated));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub="Վարորդներ, որոնք փնտրում են աշխատանք">Գտնել վարորդ</Title>
      </View>
      <View style={{ gap: 8, marginBottom: 10 }}>
        <Chips options={[['0', 'Ցանկացած'], ['1000', '1 տ+'], ['3000', '3 տ+'], ['5000', '5 տ+'], ['10000', '10 տ+']].map(([v, l]) => ({ value: v, label: l }))} value={minCap} onChange={setMinCap} />
        <Chips options={[{ value: 'any', label: 'Բոլորը' }, { value: 'yes', label: '❄️ Սառնարանային' }]} value={fridge} onChange={setFridge} />
      </View>
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {shown.length === 0 ? <Text style={styles.muted}>Այս պահին համապատասխան վարորդ չկա</Text> : null}
        {shown.map((d) => (
          <View key={d.user_id} style={[styles.card, { gap: 6 }]}>
            <Text style={styles.strong}>{d.name}</Text>
            <Text style={styles.muted}>
              {[d.vehicle_type ? vehicleLabel[d.vehicle_type] : null, d.vehicle_model, d.capacity_kg ? `${d.capacity_kg / 1000} տ` : null, d.refrigerated ? '❄️' : null].filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.muted}>Իրավունք՝ {d.license_categories.join(', ') || '—'}{d.district ? ` · ${d.district}` : ''}</Text>
            {invited[d.user_id] ? <Text style={{ color: colors.primary }}>{invited[d.user_id]}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                kind="outline"
                label="💬 Գրել"
                onPress={async () => {
                  const r = await openChat(d.user_id);
                  if (r.id) router.push(`/chat/${r.id}`);
                }}
                style={{ flex: 1 }}
              />
              <Button
                label="Հրավիրել"
                disabled={!!invited[d.user_id]}
                onPress={async () => {
                  const { error } = await supabase.rpc('invite_user', { p_user: d.user_id, p_role: 'driver' });
                  setInvited({ ...invited, [d.user_id]: error ? error.message : 'Հրավերն ուղարկված է ✓' });
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
