// 🔐 Թույլտվություններ (ղեկավար). ընտրում է խումբ (դեր / բաժին) կամ մարդ → նշիչներով բացում / փակում ֆունկցիաները։
// Կարգը. մարդ → բաժին → դեր → լռելյայն (նույնը, ինչ բազայում՝ has_perm)
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { permLabel, type Employee, type Perm } from '@/lib/types';
import { Chips, Screen, styles, Title } from '@/lib/ui';

type Row = { target: string; perm: Perm; allowed: boolean };
const perms = Object.keys(permLabel) as Perm[];
const defaults: Record<string, Perm[]> = {
  manager: ['shops_new', 'shop_terms', 'lines', 'payments_view', 'order_edit'],
  staff: ['shops_new', 'shop_terms', 'lines', 'products', 'payments_view', 'stock', 'order_edit'],
};

export default function Permissions() {
  const { session, employees, reload } = useStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [target, setTarget] = useState('role:manager');
  const me = session?.kind === 'employee' ? employees.find((e) => e.id === session.employeeId) : undefined;
  const load = useCallback(async () => {
    const { data } = await supabase.from('firm_perms').select('target, perm, allowed');
    setRows((data ?? []) as Row[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!me || me.role !== 'admin') return <Redirect href="/" />;

  const team = employees.filter((e) => e.firmId === me.firmId && e.role !== 'driver');
  const depts = [...new Set(team.filter((e) => e.role === 'staff' && e.department).map((e) => e.department!))];
  const targets = [
    { value: 'role:manager', label: 'Բոլոր մենեջերները' },
    { value: 'role:staff', label: 'Բոլոր ներքին աշխատողները' },
    ...depts.map((d) => ({ value: `dept:${d}`, label: `Բաժին՝ ${d}` })),
    ...team.map((e) => ({ value: `emp:${e.id}`, label: e.id === me.id ? `${e.name} (դուք)` : e.name })),
  ];
  // ղեկավարը ամեն ինչ կարող է. իր համար նշվում է միայն վճարումների հաստատումը
  const isAdminTarget = target.startsWith('emp:') && employees.find((x) => x.id === target.slice(4))?.role === 'admin';
  const own = (t: string, p: Perm) => rows.find((r) => r.target === t && r.perm === p)?.allowed;
  // Ժառանգված արժեքը (եթե այս թիրախի համար նշված չէ)
  const inherited = (t: string, p: Perm): boolean => {
    if (t.startsWith('emp:')) {
      const e = employees.find((x) => x.id === t.slice(4)) as Employee;
      if (e.role === 'admin') return p !== 'payments_confirm';
      return own(`dept:${e.department}`, p) ?? own(`role:${e.role}`, p) ?? (defaults[e.role] ?? []).includes(p);
    }
    if (t.startsWith('dept:')) return own('role:staff', p) ?? defaults.staff.includes(p);
    return (defaults[t.slice(5)] ?? []).includes(p);
  };
  const set = async (p: Perm, allowed: boolean) => {
    await supabase.from('firm_perms').upsert({ firm_id: me.firmId, target, perm: p, allowed });
    await load();
    reload();
  };
  const reset = async (p: Perm) => {
    await supabase.from('firm_perms').delete().eq('firm_id', me.firmId).eq('target', target).eq('perm', p);
    await load();
    reload();
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub="Ում ինչ կարելի է">🔐 Թույլտվություններ</Title>
      </View>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
        <Text style={styles.muted}>Ընտրեք խումբը կամ մարդուն։ Մարդու համար նշածը գերակա է բաժնից և խմբից։ Մենեջերը աշխատում է իր խանութների վրա, ներքին աշխատողը՝ բոլորի։</Text>
        <Chips options={targets} value={target} onChange={setTarget} />
        <View style={[styles.card, { gap: 4 }]}>
          {perms.filter((p) => !isAdminTarget || p === 'payments_confirm').map((p) => {
            const o = own(target, p);
            const value = o ?? inherited(target, p);
            return (
              <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.body}>{permLabel[p]}</Text>
                  {o === undefined ? (
                    <Text style={styles.muted}>ժառանգված</Text>
                  ) : (
                    <Pressable accessibilityRole="button" onPress={() => reset(p)} hitSlop={6}>
                      <Text style={{ color: colors.primary, fontSize: 13 }}>↺ ըստ խմբի</Text>
                    </Pressable>
                  )}
                </View>
                <Switch value={value} onValueChange={(v) => set(p, v)} accessibilityLabel={permLabel[p]} />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}
