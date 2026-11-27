// Խանութի «Վճարել եմ»-ը ֆիրմայի կողմից. եղանակ, չեկ, «Փոխանցել հաշվապահին» կամ «Գումարը ստացվել է»
// Ով է հաստատում. ում ղեկավարը նշել է (canConfirmPayments), իսկ ղեկավար չլինելու դեպքում՝ խանութի մենեջերը
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { firmHasAdmin, formatAmd, formatDayTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { paymentMethodLabel, type Employee, type Firm, type Payment, type Perm } from '@/lib/types';
import { Button, Chips, styles } from '@/lib/ui';

/** Կարո՞ղ է այս աշխատողը հաստատել այս վճարումը (նույն կանոնը, ինչ բազայում՝ can_confirm_payment) */
export function canConfirm(me: Employee, perms: Perm[], employees: Employee[], firm: Firm | undefined, managerOfShop?: string) {
  return perms.includes('payments_confirm') || (!firmHasAdmin(employees, firm) && me.role === 'manager' && managerOfShop === me.id);
}

export function PaymentCard({ payment: p, me }: { payment: Payment; me: Employee }) {
  const { shops, employees, links, firms, perms, confirmPayment, forwardPayment } = useStore();
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const link = links.find((l) => l.shopId === p.shopId && l.firmId === p.firmId);
  const mayConfirm = canConfirm(me, perms, employees, firms.find((f) => f.id === me.firmId), link?.managerId);
  // ում կարելի է փոխանցել. ներքին աշխատողներ և ղեկավար (իրական թույլտվությունը ստուգում է բազան)
  const confirmers = employees.filter((e) => e.firmId === me.firmId && e.id !== me.id && (e.role === 'staff' || e.role === 'admin') && e.hasAccount);
  const forwarded = employees.find((e) => e.id === p.forwardedTo);

  return (
    <View style={[styles.card, { gap: 8 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={[styles.strong, { flex: 1 }]}>{shops.find((x) => x.id === p.shopId)?.name}</Text>
        <Text style={styles.strong}>{formatAmd(p.amount)}</Text>
      </View>
      <Text style={styles.body}>{paymentMethodLabel[p.method] ?? p.method}</Text>
      <Text style={styles.muted}>
        {p.markedAt ? formatDayTime(p.markedAt) : ''}
        {p.note ? ` · ${p.note}` : ''}
        {forwarded ? ` · 📨 փոխանցված է՝ ${forwarded.name}` : ''}
      </Text>
      {p.receiptPath ? (
        receipt ? (
          <Image source={{ uri: receipt }} style={{ width: '100%', height: 220, borderRadius: 10 }} contentFit="contain" accessibilityLabel="Չեկ" />
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              const { data } = await supabase.storage.from('receipts').createSignedUrl(p.receiptPath!, 600);
              setReceipt(data?.signedUrl ?? null);
            }}
            hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>📎 Տեսնել չեկը</Text>
          </Pressable>
        )
      ) : null}
      {mayConfirm ? (
        <Button label="✅ Գումարը ստացվել է" onPress={async () => setErr(await confirmPayment(p.id))} />
      ) : confirmers.length ? (
        picking ? (
          <>
            <Text style={styles.muted}>Ում փոխանցել (հաշվապահ)</Text>
            <Chips
              options={confirmers.map((e) => ({ value: e.id, label: e.name }))}
              value={p.forwardedTo ?? null}
              onChange={async (to) => {
                const e = await forwardPayment(p.id, to);
                setErr(e);
                if (!e) setPicking(false);
              }}
            />
          </>
        ) : (
          <Button kind="outline" label="📨 Փոխանցել հաշվապահին" onPress={() => setPicking(true)} />
        )
      ) : (
        <Text style={styles.muted}>Հաստատում է ֆիրմայի հաշվապահը (ղեկավարը նշում է «🔐 Թույլտվություններ» էջում)</Text>
      )}
      {err ? <Text style={{ color: colors.warnText }}>{err}</Text> : null}
    </View>
  );
}
