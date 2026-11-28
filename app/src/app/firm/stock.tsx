// 📦 Պահեստ. մնացորդ, պատվիրված (դեռ չառաքված), մուտք, դուրսգրում, գույքագրում, պատմություն։
// Առաքված պատվերը ինքն է հանում պահեստից. 0 → «Չկա» ինքնաբերաբար։ Փոխել կարող է «📦 Պահեստ» իրավունքով, մյուսները՝ միայն դիտում։
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { formatDayTime } from '@/lib/rules';
import { matches } from '@/lib/search';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { Product } from '@/lib/types';
import { Button, Card, Chips, Field, Pill, Screen, styles, Title } from '@/lib/ui';

type Bal = { product_id: string; balance: number; reserved: number; last_in: string | null };
type Move = { id: string; qty: number; kind: 'in' | 'out' | 'writeoff' | 'adjust'; note: string | null; created_at: string; order_id: string | null };
type Action = 'in' | 'writeoff' | 'adjust';
const kindLabel: Record<Move['kind'], string> = { in: '📥 Մուտք', out: '🚚 Առաքում', writeoff: '🗑 Դուրսգրում', adjust: '📝 Գույքագրում' };
const actions: { value: Action; label: string }[] = [
  { value: 'in', label: '📥 Մուտք' },
  { value: 'writeoff', label: '🗑 Դուրս գրել' },
  { value: 'adjust', label: '📝 Փաստացի մնացորդ' },
];
const n = (v: number) => String(Number(v));
const num = (v: string) => Number(v.replace(',', '.'));

export default function Stock() {
  const { session, employees, products, perms, reload } = useStore();
  const me = session?.kind === 'employee' ? employees.find((e) => e.id === session.employeeId) : undefined;
  const [bal, setBal] = useState<Record<string, Bal>>({});
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [action, setAction] = useState<Action>('in');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [low, setLow] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('stock_balance');
    setBal(Object.fromEntries(((data ?? []) as Bal[]).map((b) => [b.product_id, b])));
  }, []);
  const loadMoves = useCallback(async (id: string) => {
    const { data } = await supabase.from('stock_moves').select('id, qty, kind, note, created_at, order_id').eq('product_id', id).order('created_at', { ascending: false }).limit(30);
    setMoves((data ?? []) as Move[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!me || me.role === 'driver') return <Redirect href="/" />;
  const canEdit = perms.includes('stock');
  const mine = products.filter((p) => p.firmId === me.firmId && matches(p.name, filter));
  // հաշվառվողները՝ վերևում, «քիչ է մնացել»-ը՝ ամենավերևում
  const isLow = (p: Product) => !!bal[p.id] && p.lowStock != null && Number(bal[p.id].balance) <= p.lowStock;
  const list = [...mine].sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || Number(!!bal[b.id]) - Number(!!bal[a.id]));
  const lowCount = mine.filter(isLow).length;

  const toggle = (p: Product) => {
    setMsg(null);
    setQty('');
    setNote('');
    setAction('in');
    setLow(p.lowStock != null ? n(p.lowStock) : '');
    if (open === p.id) return setOpen(null);
    setOpen(p.id);
    loadMoves(p.id);
  };

  const submit = async (p: Product) => {
    const q = num(qty);
    if (!(q >= 0) || (action !== 'adjust' && !(q > 0))) return setMsg('Գրեք քանակը');
    if (action === 'writeoff' && q > Number(bal[p.id]?.balance ?? 0)) return setMsg('Մնացորդից շատ է');
    setBusy(true);
    const { error } =
      action === 'adjust'
        ? await supabase.rpc('set_actual_stock', { p_product: p.id, p_actual: q, p_note: note.trim() || null })
        : await supabase.from('stock_moves').insert({ firm_id: me.firmId, product_id: p.id, qty: action === 'in' ? q : -q, kind: action, note: note.trim() || null, employee_id: me.id });
    setBusy(false);
    if (error) return setMsg(error.message);
    setQty('');
    setNote('');
    setMsg('✓ Պահված է');
    await Promise.all([load(), loadMoves(p.id), reload()]);
  };

  const saveLow = async (p: Product) => {
    const v = low.trim() ? num(low) : null;
    const { error } = await supabase.from('products').update({ low_stock: v }).eq('id', p.id);
    setMsg(error ? error.message : '✓ Սահմանը պահված է');
    if (!error) reload();
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub={canEdit ? 'Մուտք, դուրսգրում, մնացորդ' : 'Միայն դիտում'}>📦 Պահեստ</Title>
      </View>
      <TextInput
        placeholderTextColor={colors.textMuted}
        importantForAutofill="no"
        accessibilityLabel="Որոնել ապրանք"
        placeholder="Որոնել ապրանք"
        value={filter}
        onChangeText={setFilter}
        style={{ minHeight: 46, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 15, backgroundColor: colors.card, marginVertical: 10, color: colors.text }}
      />
      {lowCount ? <Text style={{ color: colors.warnText, marginBottom: 8 }}>⚠️ {lowCount} ապրանք քիչ է մնացել</Text> : null}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
        {!Object.keys(bal).length ? (
          <Text style={styles.muted}>Պահեստը դեռ չի հաշվառվում։ Ընտրեք ապրանքը և գրանցեք առաջին մուտքը. դրանից հետո առաքված պատվերները ինքնաբերաբար կհանվեն, իսկ 0-ի դեպքում ապրանքը կդառնա «Չկա»։</Text>
        ) : null}
        {list.map((p) => {
          const b = bal[p.id];
          const free = b ? Number(b.balance) - Number(b.reserved) : 0;
          return (
            <View key={p.id} style={[styles.card, { gap: 8 }]}>
              <Pressable accessibilityRole="button" onPress={() => toggle(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{p.name}</Text>
                  <Text style={styles.muted}>
                    {b
                      ? `Մնացորդ՝ ${n(b.balance)} ${p.unit}${Number(b.reserved) ? ` · պատվիրված՝ ${n(b.reserved)} · ազատ՝ ${n(free)}` : ''}`
                      : 'Չի հաշվառվում'}
                  </Text>
                </View>
                {isLow(p) ? <Pill text="Քիչ է" tone="warn" /> : b && !p.inStock ? <Pill text="Չկա" tone="warn" /> : null}
              </Pressable>
              {open === p.id ? (
                <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                  {canEdit ? (
                    <>
                      <Chips options={actions} value={action} onChange={setAction} />
                      <Field
                        label={action === 'adjust' ? `Փաստացի կա, ${p.unit}` : `Քանակ, ${p.unit}`}
                        value={qty}
                        onChangeText={(v) => setQty(v.replace(/[^\d.,]/g, ''))}
                        keyboardType="number-pad"
                      />
                      <Field label="Նշում (ըստ ցանկության)" value={note} onChangeText={setNote} placeholder={action === 'writeoff' ? 'Օր.՝ ժամկետանց, կոտրված' : ''} />
                      <Button label={busy ? 'Պահվում է…' : 'Պահել'} disabled={busy || !qty} onPress={() => submit(p)} />
                      {perms.includes('products') ? (
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                          <View style={{ flex: 1 }}>
                            <Field label="⚠️ Ծանուցել, երբ մնա (ըստ ցանկության)" value={low} onChangeText={(v) => setLow(v.replace(/[^\d.,]/g, ''))} keyboardType="number-pad" />
                          </View>
                          <Button kind="outline" label="Պահել" onPress={() => saveLow(p)} />
                        </View>
                      ) : null}
                    </>
                  ) : null}
                  {msg ? <Text style={{ color: msg.startsWith('✓') ? colors.primary : colors.warnText }}>{msg}</Text> : null}
                  <Text style={[styles.strong, { fontSize: 14 }]}>Պատմություն</Text>
                  {!moves.length ? <Text style={styles.muted}>Դեռ շարժ չկա</Text> : null}
                  {moves.map((m) => (
                    <View key={m.id} style={{ flexDirection: 'row', gap: 8 }}>
                      <Text style={[styles.body, { flex: 1 }]}>
                        {kindLabel[m.kind]}
                        {m.note && m.note !== 'Գույքագրում' ? <Text style={styles.muted}> · {m.note}</Text> : null}
                      </Text>
                      <Text style={[styles.strong, { color: Number(m.qty) > 0 ? colors.primary : colors.text }]}>
                        {Number(m.qty) > 0 ? '+' : ''}
                        {n(m.qty)}
                      </Text>
                      <Text style={styles.muted}>{formatDayTime(m.created_at)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
