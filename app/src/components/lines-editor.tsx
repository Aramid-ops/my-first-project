// Գծեր (առաքման ուղղություններ). օրեր, վարորդ, պատվերի վերջնաժամ, հիշեցում։
// Օգտագործում են ղեկավարը (բոլոր գծերը) և մենեջերը (իր խանութների գծերը / բոլորը, եթե ֆիրման ղեկավար չունի)։
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Line, Weekday } from '@/lib/types';
import { Button, Card, Chips, Field, styles } from '@/lib/ui';

const days: { d: Weekday; label: string }[] = [
  { d: 1, label: 'երկ' }, { d: 2, label: 'երք' }, { d: 3, label: 'չրք' }, { d: 4, label: 'հնգ' }, { d: 5, label: 'ուրբ' }, { d: 6, label: 'շբթ' }, { d: 7, label: 'կիր' },
];
const reminders = [
  { value: 'off', label: 'Անջատ' },
  { value: '30', label: '30 ր առաջ' },
  { value: '60', label: '1 ժ առաջ' },
  { value: '120', label: '2 ժ առաջ' },
];
/** «1730» → «17:30»; վավեր է միայն 00:00–23:59 */
const toTime = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};
const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function LinesExplainer() {
  return (
    <Text style={styles.muted}>
      Գիծը խանութների խումբ է, որին առաքում եք նույն օրերին։ Խանութը տեսնում է «Առաքում՝ երկուշաբթի · պատվիրեք մինչև կիրակի 17:00»։ Վերջնաժամից հետո պատվերը գնում է
      հաջորդ առաքման օրվան։ Գծերը պարտադիր չեն. առանց գծի խանութին առաքում են հաջորդ օրը։
    </Text>
  );
}

export function LinesEditor({ lines, firmId, canCreate }: { lines: Line[]; firmId: string; canCreate: boolean }) {
  const { employees, links, setLineDriver, setLineCutoff, setLineReminder, reload } = useStore();
  const [times, setTimes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const drivers = employees.filter((e) => e.firmId === firmId && e.role === 'driver');
  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from('lines').update(patch).eq('id', id);
    setMsg(error?.message ?? null);
    reload();
  };

  return (
    <View style={{ gap: 10 }}>
      {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
      {lines.map((l) => {
        const t = times[l.id] ?? l.orderCutoff ?? '';
        return (
          <Card key={l.id} style={{ gap: 8 }}>
            <Text style={styles.strong}>
              {l.name} · {links.filter((x) => x.lineId === l.id && x.status === 'active').length} խանութ
            </Text>
            <Text style={styles.muted}>Առաքման օրեր{l.deliveryDays.length === 0 ? ' (ոչ մեկը նշված չէ՝ ամեն օր)' : ''}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {days.map(({ d, label }) => {
                const on = l.deliveryDays.includes(d);
                return (
                  <Pressable
                    key={d}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => update(l.id, { delivery_days: on ? l.deliveryDays.filter((x) => x !== d) : [...l.deliveryDays, d].sort() })}
                    style={{ minWidth: 44, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, backgroundColor: on ? colors.dark : colors.card, borderWidth: 1, borderColor: on ? colors.dark : colors.borderStrong }}>
                    <Text style={{ color: on ? '#FFFFFF' : colors.text }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {drivers.length ? (
              <>
                <Text style={styles.muted}>Վարորդ</Text>
                <Chips options={drivers.map((d) => ({ value: d.id, label: d.name }))} value={l.driverId ?? null} onChange={(v) => setLineDriver(l.id, v)} />
              </>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Field label="Պատվերի վերջնաժամ (ժժ:րր)" value={t} onChangeText={(v) => setTimes({ ...times, [l.id]: toTime(v) })} keyboardType="number-pad" placeholder="Չկա" />
              </View>
              <Button
                label="Պահել"
                disabled={t === (l.orderCutoff ?? '') || (t !== '' && !validTime(t))}
                onPress={() => setLineCutoff(l.id, t || null)}
              />
            </View>
            {l.orderCutoff ? (
              <>
                <Text style={styles.muted}>Հիշեցում խանութներին, որոնք դեռ չեն պատվիրել</Text>
                <Chips options={reminders} value={l.reminderMinutes ? String(l.reminderMinutes) : 'off'} onChange={(v) => setLineReminder(l.id, v === 'off' ? null : Number(v))} />
              </>
            ) : null}
          </Card>
        );
      })}
      {canCreate ? (
        <Card style={{ gap: 8 }}>
          <Field label="Նոր գիծ (օր.՝ Ավան)" value={newName} onChangeText={setNewName} autoComplete="off" />
          <Button
            kind="outline"
            label="+ Ավելացնել գիծ"
            disabled={!newName.trim()}
            onPress={async () => {
              const { error } = await supabase.from('lines').insert({ firm_id: firmId, name: newName.trim(), delivery_days: [] });
              setMsg(error?.message ?? null);
              if (!error) setNewName('');
              reload();
            }}
          />
        </Card>
      ) : null}
    </View>
  );
}
