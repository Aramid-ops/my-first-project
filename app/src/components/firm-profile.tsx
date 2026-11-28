// Ֆիրմայի պրոֆիլ (ղեկավար). ինչ ենք մատակարարում (կատեգորիաներ), որտեղ ենք առաքում (տարածք), հասցե, կոնտակտ։
// Կատեգորիաները և տարածքը համակարգը «հասկանում է». որոնում, «Մոտիկից», «Ով է գնում», «Փնտրում եմ մատակարար» ծանուցումներ
import { useState } from 'react';
import { Text } from 'react-native';

import { ALL_YEREVAN, districts, regions } from '@/lib/districts';
import { normalizePhone } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import type { Firm } from '@/lib/types';
import { Button, Chips, Field, MultiChips, styles } from '@/lib/ui';

export function FirmProfile({ firm }: { firm: Firm }) {
  const { products, updateFirm, categories } = useStore();
  const init = () => ({
    categories: firm.categories ?? [],
    areas: firm.serviceAreas ?? [],
    district: firm.district ?? '',
    street: firm.address ?? '',
    description: firm.description ?? '',
    phone: firm.phone ?? '',
    min: String(firm.minOrderAmount ?? 0),
  });
  const [f, setF] = useState(init);
  const [msg, setMsg] = useState<string | null>(null);
  // Ապրանքներից առաջարկվող կատեգորիաները
  const fromProducts = [...new Set(products.filter((p) => p.firmId === firm.id && p.category && p.category !== 'Այլ').map((p) => p.category!))];
  const suggest = fromProducts.filter((c) => !f.categories.includes(c));
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  return (
    <>
      <Text style={styles.strong}>Ինչ ենք մատակարարում</Text>
      {suggest.length ? (
        <Text style={{ color: colors.primary }} onPress={() => set({ categories: [...f.categories, ...suggest] })}>
          Ձեր ապրանքներից՝ {suggest.join(', ')} · ավելացնել →
        </Text>
      ) : null}
      <MultiChips options={[...new Set([...categories.filter((c) => c !== 'Այլ'), ...f.categories])]} value={f.categories} onChange={(v) => set({ categories: v })} />

      <Text style={[styles.strong, { marginTop: 8 }]}>Որտեղ ենք առաքում</Text>
      <MultiChips options={[ALL_YEREVAN]} value={f.areas} onChange={(v) => set({ areas: v })} />
      {!f.areas.includes(ALL_YEREVAN) ? <MultiChips options={districts} value={f.areas} onChange={(v) => set({ areas: v })} /> : null}
      <Text style={styles.muted}>Մարզեր</Text>
      <MultiChips options={regions} value={f.areas} onChange={(v) => set({ areas: v })} />

      <Text style={[styles.strong, { marginTop: 8 }]}>Հասցե (պահեստ / գրասենյակ)</Text>
      <Chips options={[...districts, ...regions].map((d) => ({ value: d, label: d }))} value={f.district} onChange={(v) => set({ district: v })} />
      <Field label="Փողոց, շենք (միայն ցույց տալու համար)" value={f.street} onChangeText={(v) => set({ street: v })} autoComplete="off" />

      <Field label="Մեր մասին (ըստ ցանկության, օր.՝ ընտանեկան ֆերմա, 15 տարի)" value={f.description} onChangeText={(v) => set({ description: v })} autoComplete="off" />
      <Field label="Հեռախոս" value={f.phone} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" />
      <Field label="Նվազագույն պատվեր, ֏" value={f.min} onChangeText={(v) => set({ min: v.replace(/\D/g, '') })} keyboardType="number-pad" />
      {msg ? <Text style={{ color: msg.startsWith('✓') ? colors.primary : colors.warnText }}>{msg}</Text> : null}
      <Button
        label="Պահել"
        onPress={async () => {
          const err = await updateFirm({
            categories: f.categories,
            category: f.categories.join(', ') || null,
            service_areas: f.areas.includes(ALL_YEREVAN) ? f.areas.filter((a) => !districts.includes(a)) : f.areas,
            district: f.district || null,
            address: f.street.trim() || null,
            description: f.description.trim() || null,
            phone: f.phone.replace(/\D/g, '').length > 3 ? normalizePhone(f.phone) : null,
            min_order_amount: Number(f.min || 0),
          });
          setMsg(err ?? '✓ Պահված է');
        }}
      />
    </>
  );
}
