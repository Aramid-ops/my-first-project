// Գրել կամ թելադրել պատվերը. ձայնը տեքստ է դարձնում հեռախոսի ստեղնաշարի 🎤-ը (ձայն չենք պահում),
// խանութը ստուգում է տեքստը և ուղարկում իր մենեջերին։
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { formatDayTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors, radius } from '@/lib/theme';
import { Button, Card, Pill, Screen, styles, Title } from '@/lib/ui';

export default function DictateOrder() {
  const { firmId } = useLocalSearchParams<{ firmId: string }>();
  const { session, firms, links, employees, textOrders, sendTextOrder } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const firm = firms.find((f) => f.id === firmId);
  const link = links.find((l) => l.shopId === session.shopId && l.firmId === firmId);
  if (!firm || !link) return null;
  const manager = employees.find((e) => e.id === link.managerId);
  const sent = textOrders.filter((t) => t.firmId === firmId);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub={manager ? `Կստանա մենեջերը՝ ${manager.name}` : undefined}>Պատվեր՝ {firm.name}</Title>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        <Text style={styles.muted}>Գրեք կամ սեղմեք ստեղնաշարի 🎤-ը և ասեք, օր.՝ «երկու արկղ կոլա, տասը կաթ»։ Ստուգեք տեքստը և ուղարկեք։</Text>
        <TextInput
          importantForAutofill="no"
          accessibilityLabel="Պատվերի տեքստը"
          placeholder="Ինչ է պետք…"
          value={text}
          onChangeText={(v) => {
            setText(v);
            setMsg(null);
          }}
          multiline
          textAlignVertical="top"
          style={{ minHeight: 160, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 14, fontSize: 16, backgroundColor: colors.card, color: colors.text }}
        />
        {msg ? <Text style={{ color: msg.ok ? colors.primary : colors.warnText }}>{msg.text}</Text> : null}
        <Button
          label={busy ? 'Ուղարկվում է…' : 'Ուղարկել մենեջերին'}
          disabled={busy || !text.trim()}
          onPress={async () => {
            setBusy(true);
            const e = await sendTextOrder(firm.id, text);
            setBusy(false);
            if (e) setMsg({ ok: false, text: e });
            else {
              setText('');
              setMsg({ ok: true, text: '✓ Ուղարկված է։ Մենեջերը կձևակերպի պատվերը։' });
            }
          }}
        />
        {sent.length ? <Text style={[styles.strong, { marginTop: 8 }]}>Ուղարկված</Text> : null}
        {sent.map((t) => (
          <Card key={t.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.muted}>{formatDayTime(t.createdAt)}</Text>
              <Pill text={t.status === 'done' ? 'Ձևակերպված է' : 'Սպասում է'} tone={t.status === 'done' ? 'ok' : 'info'} />
            </View>
            <Text style={styles.body}>{t.text}</Text>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
