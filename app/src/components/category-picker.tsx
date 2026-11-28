// 🏷 Ապրանքի կատեգորիայի ընտրություն հարթակի ցանկից (առաջարկը՝ ըստ անվան, առաջինը)։
// Նոր կատեգորիա ավելացնում է միայն հարթակը (🛡 → Կատեգորիաներ)։
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import { colors, radius } from '@/lib/theme';
import type { Product } from '@/lib/types';
import { Button, Chips, styles } from '@/lib/ui';

export function CategoryPicker({ product: p, onDone }: { product: Product; onDone: (saved: boolean) => void }) {
  const { saveProduct, categories } = useStore();
  // առաջարկը (ըստ անվան)՝ առաջինը
  const options = [...new Set([...(p.category && categories.includes(p.category) ? [p.category] : []), ...categories])];
  const [value, setValue] = useState<string>(p.categoryAuto === false && p.category ? p.category : p.category && p.category !== 'Այլ' ? p.category : '');
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    const category = value;
    if (!category) return setMsg('Ընտրեք կատեգորիան');
    const err = await saveProduct({ ...p, category, categoryAuto: false });
    if (err) return setMsg(err);
    onDone(true);
  };

  return (
    <View style={{ gap: 8, backgroundColor: '#FBF3EC', borderRadius: radius.md, padding: 10 }}>
      <Text style={styles.body}>
        🏷 Ընտրեք «{p.name}»-ի կատեգորիան
        {p.categoryAuto !== false && p.category && p.category !== 'Այլ' ? <Text style={styles.muted}> (առաջարկ՝ {p.category})</Text> : null}
      </Text>
      <Chips
        options={options.map((c) => ({ value: c, label: c }))}
        value={value}
        onChange={(v) => {
          setMsg(null);
          setValue(v);
        }}
      />
      <Text style={styles.muted}>Չգտա՞ք հարմարը՝ ընտրեք «Այլ», մենք կավելացնենք նոր կատեգորիա։</Text>
      {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button kind="outline" label="Չեղարկել" onPress={() => onDone(false)} style={{ flex: 1 }} />
        <Button label="Պահել" onPress={save} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
