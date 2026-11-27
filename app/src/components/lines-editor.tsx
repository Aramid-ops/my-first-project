// Գծեր (առաքման ուղղություններ). օրեր, վարորդ, պատվերի վերջնաժամ, հիշեցում։
// Օգտագործում են ղեկավարը (բոլոր գծերը) և մենեջերը (իր խանութների գծերը / բոլորը, եթե ֆիրման ղեկավար չունի)։
import { useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';

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

/** Հաստատում (վեբում՝ confirm, հեռախոսում՝ Alert) */
function confirm(question: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(question)) onYes();
  } else Alert.alert(question, undefined, [{ text: 'Ոչ', style: 'cancel' }, { text: 'Այո', style: 'destructive', onPress: onYes }]);
}

/** `shopIds`՝ որ խանութները կարող է դնել գծի վրա (ղեկավար՝ բոլորը, մենեջեր՝ իրենը) */
export function LinesEditor({ lines, firmId, canCreate, shopIds }: { lines: Line[]; firmId: string; canCreate: boolean; shopIds: string[] }) {
  const { employees, links, shops, setLineDriver, setLineCutoff, setLineReminder, setLinkLine, reload } = useStore();
  const [times, setTimes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [shopsOf, setShopsOf] = useState<string | null>(null);
  const drivers = employees.filter((e) => e.firmId === firmId && e.role === 'driver');
  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from('lines').update(patch).eq('id', id);
    setMsg(error?.message ?? null);
    reload();
  };

  return (
    <View style={{ gap: 10 }}>
      {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
      {canCreate ? (
        <Card style={{ gap: 8 }}>
          <Field label="➕ Նոր գիծ (օր.՝ Ավան)" value={newName} onChangeText={setNewName} autoComplete="off" />
          <Button
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
      {lines.map((l) => {
        const t = times[l.id] ?? l.orderCutoff ?? '';
        return (
          <Card key={l.id} style={{ gap: 8 }}>
            {renaming?.id === l.id ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <Field label="Գծի անունը" value={renaming.name} onChangeText={(v) => setRenaming({ id: l.id, name: v })} autoComplete="off" />
                </View>
                <Button label="Պահել" disabled={!renaming.name.trim()} onPress={async () => { await update(l.id, { name: renaming.name.trim() }); setRenaming(null); }} />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Text style={[styles.strong, { flex: 1 }]}>{l.name}</Text>
                {canCreate ? (
                  <>
                    <Pressable accessibilityRole="button" accessibilityLabel="Փոխել անունը" onPress={() => setRenaming({ id: l.id, name: l.name })} hitSlop={8}>
                      <Text style={{ fontSize: 18 }}>✏️</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Ջնջել գիծը"
                      hitSlop={8}
                      onPress={() =>
                        confirm(`Ջնջե՞լ «${l.name}» գիծը։ Նրա խանութները կմնան առանց գծի։`, async () => {
                          const { error } = await supabase.from('lines').delete().eq('id', l.id);
                          setMsg(error?.message ?? null);
                          reload();
                        })
                      }>
                      <Text style={{ fontSize: 18 }}>🗑</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            )}
            {/* Խանութները այս գծի վրա. նշել / հանել */}
            <Pressable accessibilityRole="button" onPress={() => setShopsOf(shopsOf === l.id ? null : l.id)} hitSlop={6}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>
                🏪 Խանութներ ({links.filter((x) => x.lineId === l.id && x.status === 'active').length}) {shopsOf === l.id ? '▴' : '▾'}
              </Text>
            </Pressable>
            {shopsOf === l.id
              ? links
                  .filter((x) => x.firmId === firmId && x.status === 'active' && shopIds.includes(x.shopId))
                  .map((x) => {
                    const on = x.lineId === l.id;
                    const other = !on && x.lineId ? lines.find((y) => y.id === x.lineId)?.name : null;
                    return (
                      <Pressable
                        key={x.shopId}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        onPress={() => setLinkLine(x.shopId, firmId, on ? null : l.id)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                        <Text style={{ fontSize: 18 }}>{on ? '☑' : '☐'}</Text>
                        <Text style={[styles.body, { flex: 1 }]}>{shops.find((sh) => sh.id === x.shopId)?.name}</Text>
                        {other ? <Text style={styles.muted}>{other}</Text> : null}
                      </Pressable>
                    );
                  })
              : null}
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
    </View>
  );
}
