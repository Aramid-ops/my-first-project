// Անկախ վարորդի էջը (ֆիրմայի աշխատող չէ)։ Այս էջը հետո կմշակենք (պատվերներ, փոխադրումներ)։
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';

import { ChatButton, PlatformLink } from '@/components/chat-button';
import { VerificationBanner } from '@/components/verification-banner';
import { InviteButton } from '@/components/invite-button';
import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Button, Card, Screen, styles, Title } from '@/lib/ui';

const vehicleLabel: Record<string, string> = { car: 'Մարդատար', van: 'Ֆուրգոն', truck: 'Բեռնատար' };

export default function Me() {
  const { session, driverProfile: d, signOut, reload } = useStore();
  const [invites, setInvites] = useState<{ id: string; firm: string; role: string }[]>([]);
  const [looking, setLooking] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [{ data: inv }, { data: prof }] = await Promise.all([
      supabase.from('job_invites').select('id, role, firms(name)').eq('status', 'pending'),
      supabase.from('driver_profiles').select('looking_for_work').maybeSingle(),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setInvites((inv ?? []).map((x: any) => ({ id: x.id, role: x.role, firm: x.firms?.name ?? '' })));
    if (prof) setLooking(!!prof.looking_for_work);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (session?.kind !== 'driverSelf' || !d) return <Redirect href="/" />;
  const rows: [string, string | undefined][] = [
    ['Հեռախոս', d.phone],
    ['Հասցե', d.address],
    ['Վարորդական իրավունք', d.licenseCategories.join(', ') || undefined],
    ['Մեքենա', [d.vehicleType ? vehicleLabel[d.vehicleType] ?? d.vehicleType : undefined, d.vehicleModel].filter(Boolean).join(' · ') || undefined],
    ['Համարանիշ', d.plate],
    ['Բեռնատարողություն', d.capacityKg ? (d.capacityKg >= 1000 ? `${d.capacityKg / 1000} տ` : `${d.capacityKg} կգ`) : undefined],
    ['Սառնարանային', d.refrigerated ? 'Այո' : 'Ոչ'],
  ];
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
      <Title sub={d.verificationStatus === 'approved' ? 'Վարորդ · ✅ նույնականացված' : 'Վարորդ'}>{d.name}</Title>
      <VerificationBanner />
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        <Card style={{ gap: 10 }}>
          {rows.map(([k, v]) =>
            v ? (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text style={styles.muted}>{k}</Text>
                <Text style={[styles.body, { flexShrink: 1, textAlign: 'right' }]}>{v}</Text>
              </View>
            ) : null,
          )}
        </Card>
        {invites.map((j) => (
          <Card key={j.id} style={{ gap: 10, borderColor: colors.primary }}>
            <Text style={styles.strong}>📩 «{j.firm}»-ը հրավիրում է ձեզ աշխատանքի որպես վարորդ</Text>
            {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button kind="outline" label="Մերժել" onPress={async () => { await supabase.rpc('answer_job_invite', { p_invite: j.id, p_accept: false }); load(); }} style={{ flex: 1 }} />
              <Button
                label="Ընդունել"
                onPress={async () => {
                  const { error } = await supabase.rpc('answer_job_invite', { p_invite: j.id, p_accept: true });
                  if (error) setMsg(error.message);
                  else { await reload(); router.replace('/'); }
                }}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ))}
        <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.strong}>Փնտրում եմ աշխատանք</Text>
            <Text style={styles.muted}>Միացված լինելու դեպքում ֆիրմաները կտեսնեն ձեզ և կարող են հրավիրել</Text>
          </View>
          <Switch
            value={looking}
            onValueChange={async (v) => {
              setLooking(v);
              await supabase.from('driver_profiles').update({ looking_for_work: v }).eq('user_id', (await supabase.auth.getSession()).data.session?.user.id ?? '');
            }}
          />
        </Card>
        <Card style={{ gap: 6 }}>
          <Text style={styles.strong}>Աշխատանք ֆիրմայում</Text>
          <Text style={styles.muted}>Եթե ֆիրման ձեզ հրավիրել է, սեղմեք վերևում «🔑 Կոդ» և գրեք նրա տված կոդը։ Դրանից հետո կտեսնեք ձեր կանգառները։</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}
