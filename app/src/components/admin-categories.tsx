// 🛡 Հարթակ → Կատեգորիաներ. մեկ ցանկ բոլոր ֆիրմաների համար (ֆիրմաները միայն ընտրում են)։
// Ավելացնել · ✏️ անվանափոխել (եղած անունով՝ միավորել) · 🗑 ջնջել (ապրանքները՝ «Այլ») · բանալի բառեր (ավտոմատ գուշակման համար)
// · «Այլ»-ում ընկած ապրանքները՝ ձեռքով տեղավորելու համար
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Button, Card, Chips, Field, styles } from '@/lib/ui';

type Cat = { name: string; products: number; keywords: string[] };
type Loose = { id: string; name: string; firm_name: string };

function confirm(question: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(question)) onYes();
  } else Alert.alert(question, undefined, [{ text: 'Ոչ', style: 'cancel' }, { text: 'Այո', style: 'destructive', onPress: onYes }]);
}

export function AdminCategories() {
  const { reload } = useStore();
  const [cats, setCats] = useState<Cat[]>([]);
  const [loose, setLoose] = useState<Loose[]>([]);
  const [add, setAdd] = useState('');
  const [edit, setEdit] = useState<{ name: string; newName: string; keywords: string } | null>(null);
  const [place, setPlace] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([supabase.rpc('category_stats'), supabase.rpc('uncategorized_products')]);
    setCats((c.data ?? []) as Cat[]);
    setLoose((l.data ?? []) as Loose[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const done = async (error: { message: string } | null, ok: string) => {
    setMsg(error ? error.message : ok);
    if (!error) await Promise.all([load(), reload()]);
    return !error;
  };

  const saveEdit = async () => {
    if (!edit) return;
    const name = edit.newName.trim();
    if (name !== edit.name) {
      const exists = cats.some((c) => c.name === name);
      const { error } = await supabase.rpc('rename_category', { p_old: edit.name, p_new: name });
      if (!(await done(error, exists ? `✓ «${edit.name}»-ը միավորվեց «${name}»-ին` : '✓ Անվանափոխված է'))) return;
    }
    // բանալի բառեր. փոխարինում ենք ամբողջությամբ
    const words = [...new Set(edit.keywords.split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2))];
    await supabase.from('category_keywords').delete().eq('category', name);
    const { error } = words.length ? await supabase.from('category_keywords').insert(words.map((keyword) => ({ category: name, keyword }))) : { error: null };
    if (await done(error, '✓ Պահված է')) setEdit(null);
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.muted}>
        Ֆիրմաները կատեգորիա ընտրում են միայն այս ցանկից։ Բանալի բառերով համակարգը ինքն է առաջարկում կատեգորիան ըստ ապրանքի անվան։
      </Text>
      <Card style={{ gap: 8 }}>
        <Field label="Նոր կատեգորիա" value={add} onChangeText={setAdd} placeholder="Օր.՝ Կենդանիների կեր" autoComplete="off" />
        <Button
          label="+ Ավելացնել"
          disabled={add.trim().length < 2}
          onPress={async () => {
            const { error } = await supabase.from('categories').insert({ name: add.trim().replace(/\s+/g, ' ') });
            if (await done(error && (error.code === '23505' ? { message: 'Այդ կատեգորիան արդեն կա' } : error), '✓ Ավելացված է')) setAdd('');
          }}
        />
      </Card>
      {msg ? <Text style={{ color: msg.startsWith('✓') ? colors.primary : colors.warnText }}>{msg}</Text> : null}

      {cats.map((c) =>
        edit?.name === c.name ? (
          <Card key={c.name} style={{ gap: 8 }}>
            <Field label="Անուն (եղած կատեգորիայի անունով՝ կմիավորվեն)" value={edit.newName} onChangeText={(v) => setEdit({ ...edit, newName: v })} autoComplete="off" />
            <Field label="Բանալի բառեր (ստորակետով)" value={edit.keywords} onChangeText={(v) => setEdit({ ...edit, keywords: v })} placeholder="օր.՝ կեր, կատվի, շան" autoComplete="off" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button kind="outline" label="Չեղարկել" onPress={() => setEdit(null)} style={{ flex: 1 }} />
              <Button label="Պահել" disabled={edit.newName.trim().length < 2} onPress={saveEdit} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : (
          <View key={c.name} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>
                {c.name} <Text style={styles.muted}>· {c.products} ապրանք</Text>
              </Text>
              {c.keywords.length ? <Text style={styles.muted} numberOfLines={2}>🔑 {c.keywords.join(', ')}</Text> : null}
            </View>
            {c.name !== 'Այլ' ? (
              <>
                <Pressable accessibilityRole="button" accessibilityLabel={`Փոխել՝ ${c.name}`} hitSlop={8} onPress={() => { setMsg(null); setEdit({ name: c.name, newName: c.name, keywords: c.keywords.join(', ') }); }}>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>✏️</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ջնջել՝ ${c.name}`}
                  hitSlop={8}
                  onPress={() =>
                    confirm(`Ջնջե՞լ «${c.name}»-ը։ ${c.products} ապրանք կանցնի «Այլ»-ի մեջ։`, async () => {
                      const { error } = await supabase.rpc('delete_category', { p_name: c.name });
                      done(error, '✓ Ջնջված է');
                    })
                  }>
                  <Text style={{ color: colors.warnText, fontWeight: '600' }}>🗑</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ),
      )}

      <Text style={[styles.strong, { marginTop: 8 }]}>«Այլ»-ում են · {loose.length}</Text>
      {!loose.length ? <Text style={styles.muted}>Բոլոր ապրանքները տեղավորված են</Text> : null}
      {loose.map((p) => (
        <Card key={p.id} style={{ gap: 6 }}>
          <Text style={styles.body}>
            {p.name} <Text style={styles.muted}>· {p.firm_name}</Text>
          </Text>
          <Chips options={cats.filter((c) => c.name !== 'Այլ').map((c) => ({ value: c.name, label: c.name }))} value={place[p.id] ?? ''} onChange={(v) => setPlace({ ...place, [p.id]: v })} />
          <Button
            kind="outline"
            label="Տեղավորել"
            disabled={!place[p.id]}
            onPress={async () => {
              const { error } = await supabase.rpc('admin_set_product_category', { p_product: p.id, p_category: place[p.id] });
              done(error, `✓ «${p.name}» → ${place[p.id]}`);
            }}
          />
        </Card>
      ))}
    </View>
  );
}
