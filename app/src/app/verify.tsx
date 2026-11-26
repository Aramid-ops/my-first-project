// Վարորդի նույնականացում. 3 լուսանկար → ստուգում (մենք)։ Փաստաթղթերը տեսնում են միայն վարորդը և ստուգողները։
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { pickPrivateDoc } from '@/lib/media';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Button, Card, Screen, styles, Title } from '@/lib/ui';

type Slot = 'front' | 'back' | 'selfie';
const slots: { key: Slot; title: string; hint: string; camera: boolean }[] = [
  { key: 'front', title: '1. Վարորդական իրավունք՝ առջևի կողմը', hint: 'Ամբողջ քարտը, լավ լուսավորությամբ, առանց փայլի', camera: false },
  { key: 'back', title: '2. Վարորդական իրավունք՝ հետևի կողմը', hint: 'Կարգերը (B, C...) պետք է ընթեռնելի լինեն', camera: false },
  { key: 'selfie', title: '3. Անձնագիրը դեմքի մոտ (սելֆի)', hint: 'Պահեք անձնագրի լուսանկարով էջը դեմքի կողքին. և՛ դեմքը, և՛ անձնագիրը պետք է պարզ երևան', camera: true },
];

export default function Verify() {
  const { session, driverProfile, reload } = useStore();
  const [paths, setPaths] = useState<Partial<Record<Slot, string>>>({});
  const [previews, setPreviews] = useState<Partial<Record<Slot, string>>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!driverProfile) return <Redirect href="/" />;

  const pick = async (slot: Slot, source: 'camera' | 'library') => {
    const uid = (await supabase.auth.getSession()).data.session?.user.id;
    if (!uid) return;
    const r = await pickPrivateDoc(uid, slot, source);
    if (r.error) setMsg({ ok: false, text: r.error });
    if (r.path) {
      setPaths((p) => ({ ...p, [slot]: r.path }));
      setPreviews((p) => ({ ...p, [slot]: r.previewUri }));
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub="Որ ֆիրմաները վստահեն ձեզ">Նույնականացում</Title>
      </View>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
        {slots.map((s) => (
          <Card key={s.key} style={{ gap: 8 }}>
            <Text style={styles.strong}>{s.title}</Text>
            <Text style={styles.muted}>{s.hint}</Text>
            {previews[s.key] ? <Image source={{ uri: previews[s.key] }} style={{ width: '100%', height: 180, borderRadius: radius.md }} contentFit="cover" accessibilityLabel={s.title} /> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button kind={paths[s.key] ? 'outline' : 'primary'} label={paths[s.key] ? '📷 Նորից' : '📷 Լուսանկարել'} onPress={() => pick(s.key, 'camera')} style={{ flex: 1 }} />
              {!s.camera ? <Button kind="outline" label="Պատկերասրահից" onPress={() => pick(s.key, 'library')} style={{ flex: 1 }} /> : null}
            </View>
          </Card>
        ))}
        <Text style={[styles.muted, { textAlign: 'center' }]}>🔒 Լուսանկարները տեսնում են միայն դուք և «Մատակարար»-ի ստուգողները. ֆիրմաները տեսնում են միայն «Նույնականացված է» նշանը</Text>
        {msg ? <Text style={{ color: msg.ok ? colors.primary : colors.warnText, textAlign: 'center' }}>{msg.text}</Text> : null}
        <Button
          label={busy ? 'Ուղարկվում է…' : 'Ուղարկել ստուգման'}
          disabled={busy || !paths.front || !paths.back || !paths.selfie}
          onPress={async () => {
            setBusy(true);
            const { error } = await supabase.rpc('submit_driver_verification', { p_front: paths.front, p_back: paths.back, p_selfie: paths.selfie });
            setBusy(false);
            if (error) setMsg({ ok: false, text: error.message });
            else {
              await reload();
              router.replace(session?.kind === 'employee' ? '/driver' : '/me');
            }
          }}
        />
      </ScrollView>
    </Screen>
  );
}
