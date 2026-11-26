// 🔑 «Հրավերի կոդ» — բոլորի համար, վերևի անկյունում։ Կոդով դառնում ես ֆիրմայի աշխատող։
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Button, Field, styles } from '@/lib/ui';

export function InviteButton() {
  const { acceptInvite } = useStore();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Հրավերի կոդ" onPress={() => { setOpen(true); setMsg(null); }} hitSlop={12}>
        <Text style={styles.muted}>🔑 Կոդ</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Փակել" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(23,32,28,0.35)', justifyContent: 'center', padding: 24 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.bg, borderRadius: 20, padding: 20, gap: 12, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
            <Text style={[styles.strong, { fontSize: 18 }]}>Հրավերի կոդ</Text>
            <Text style={styles.muted}>Եթե ֆիրման ձեզ աշխատանքի է հրավիրել, գրեք նրա տված 6-նիշ կոդը</Text>
            <Field label="Կոդ" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" />
            {msg ? <Text style={{ color: msg.ok ? colors.primary : colors.warnText }}>{msg.text}</Text> : null}
            <Button
              label="Ընդունել"
              disabled={code.length !== 6}
              onPress={async () => {
                const r = await acceptInvite(code);
                if (r.error) setMsg({ ok: false, text: r.error });
                else {
                  setMsg({ ok: true, text: `Դուք այժմ «${r.firm}»-ի աշխատող եք ✓` });
                  setTimeout(() => { setOpen(false); router.replace('/'); }, 1200);
                }
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
