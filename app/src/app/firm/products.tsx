// Ֆիրմայի ապրանքներ (ղեկավար և ներքին աշխատողներ). ավելացնել, փոխել, նկար, «Չկա», CSV ներմուծում
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { pickAndUpload } from '@/lib/media';
import { formatAmd } from '@/lib/rules';
import { matches } from '@/lib/search';
import { useStore } from '@/lib/store';
import { colors, radius } from '@/lib/theme';
import { units, type Product, type Unit } from '@/lib/types';
import { Button, Card, Chips, Field, Screen, styles, Title } from '@/lib/ui';

type Draft = { id?: string; name: string; unit: Unit; packNote: string; price: string; minQty: string; step: string; weighed: boolean; inStock: boolean; imageUrl?: string };
const empty: Draft = { name: '', unit: 'հատ', packNote: '', price: '', minQty: '1', step: '1', weighed: false, inStock: true };
const toDraft = (p: Product): Draft => ({ id: p.id, name: p.name, unit: p.unit, packNote: p.packNote ?? '', price: String(p.price), minQty: String(p.minQty), step: String(p.step), weighed: !!p.weighed, inStock: p.inStock, imageUrl: p.imageUrl });

/** CSV՝ Excel-ից «Save as CSV». սյուներ՝ name, unit, price, min_qty, step, pack_note (առաջին տողը՝ վերնագրեր) */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = l.split(sep);
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim().replace(/^"|"$/g, '')]));
  });
}

export default function FirmProducts() {
  const { session, employees, products, saveProduct } = useStore();
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const me = session?.kind === 'employee' ? employees.find((e) => e.id === session.employeeId) : undefined;
  if (!me || !(me.role === 'admin' || me.role === 'staff')) return <Redirect href="/" />;
  const list = products.filter((p) => p.firmId === me.firmId && (matches(p.name, filter) || (p.sku ?? '').toLowerCase().startsWith(filter.trim().toLowerCase())));
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const num = (v: string) => Number(v.replace(',', '.'));

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const err = await saveProduct({
      id: draft.id,
      firmId: me.firmId,
      name: draft.name.trim(),
      unit: draft.unit,
      packNote: draft.packNote.trim(),
      price: num(draft.price),
      minQty: num(draft.minQty) || 1,
      step: num(draft.step) || 1,
      weighed: draft.weighed,
      inStock: draft.inStock,
      imageUrl: draft.imageUrl,
    });
    setBusy(false);
    setMsg(err);
    if (!err) setDraft(null);
  };

  const importCsv = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'] });
    if (res.canceled || !res.assets?.[0]) return;
    const rows = parseCsv(await (await fetch(res.assets[0].uri)).text());
    let ok = 0;
    const errors: string[] = [];
    for (const r of rows) {
      const name = r.name || r['անվանում'];
      const price = num(r.price || r['գին'] || '');
      if (!name || !price) continue;
      const unit = (units.includes((r.unit || r['միավոր']) as Unit) ? r.unit || r['միավոր'] : 'հատ') as Unit;
      const existing = products.find((p) => p.firmId === me.firmId && p.name === name);
      const err = await saveProduct({
        id: existing?.id,
        firmId: me.firmId,
        name,
        unit,
        price,
        minQty: num(r.min_qty || '1') || 1,
        step: num(r.step || r.min_qty || '1') || 1,
        packNote: r.pack_note || '',
        weighed: unit === 'կգ' || unit === 'գ',
        inStock: true,
      });
      if (err) errors.push(`${name}: ${err}`);
      else ok++;
    }
    setMsg(`Ներմուծված է՝ ${ok}${errors.length ? ` · սխալներ՝ ${errors.length}` : ''}`);
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub={`${list.length} ապրանք`}>Ապրանքներ</Title>
      </View>

      {draft ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
          <Card style={{ gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ընտրել նկար"
              onPress={async () => {
                const r = await pickAndUpload(`firm/${me.firmId}`);
                if (r.url) set({ imageUrl: r.url });
                if (r.error) setMsg(r.error);
              }}
              style={{ alignSelf: 'flex-start', width: 96, height: 96, borderRadius: radius.md, backgroundColor: '#F2F1EC', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {draft.imageUrl ? <Image source={{ uri: draft.imageUrl }} style={{ width: 96, height: 96 }} contentFit="cover" /> : <Text style={styles.muted}>+ Նկար</Text>}
            </Pressable>
            <Field label="Անվանում" value={draft.name} onChangeText={(v) => set({ name: v })} />
            <Text style={styles.muted}>Միավոր</Text>
            <Chips options={units.map((u) => ({ value: u, label: u }))} value={draft.unit} onChange={(u) => set({ unit: u, weighed: u === 'կգ' || u === 'գ' ? true : draft.weighed })} />
            <Field label={`Գին մեկ ${draft.unit}-ի համար, ֏`} value={draft.price} onChangeText={(v) => set({ price: v.replace(/[^\d.,]/g, '') })} keyboardType="number-pad" />
            <Field label="Փաթեթավորում (օր.՝ 1 բլոկ = 30 հատ)" value={draft.packNote} onChangeText={(v) => set({ packNote: v })} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Նվազագույն քանակ" value={draft.minQty} onChangeText={(v) => set({ minQty: v.replace(/[^\d.,]/g, '') })} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Քայլ" value={draft.step} onChangeText={(v) => set({ step: v.replace(/[^\d.,]/g, '') })} keyboardType="number-pad" />
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.body}>Կշռվող (իրական քաշը՝ առաքելիս)</Text>
              <Switch value={draft.weighed} onValueChange={(v) => set({ weighed: v })} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.body}>Առկա է</Text>
              <Switch value={draft.inStock} onValueChange={(v) => set({ inStock: v })} />
            </View>
          </Card>
          {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
          <Button label={busy ? 'Պահվում է…' : 'Պահել'} disabled={busy || !draft.name.trim() || !num(draft.price)} onPress={save} />
          <Button kind="outline" label="Չեղարկել" onPress={() => setDraft(null)} />
        </ScrollView>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <Button label="+ Նոր ապրանք" onPress={() => { setMsg(null); setDraft({ ...empty }); }} style={{ flex: 1 }} />
            <Button kind="outline" label="Ներմուծել CSV" onPress={importCsv} style={{ flex: 1 }} />
          </View>
          <TextInput
            accessibilityLabel="Որոնել ապրանք"
            placeholder="Որոնել ապրանք կամ արտիկուլ"
            value={filter}
            onChangeText={setFilter}
            style={{ minHeight: 46, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 15, backgroundColor: colors.card, marginBottom: 10, color: colors.text }}
          />
          {msg ? <Text style={{ color: colors.primary, marginBottom: 8 }}>{msg}</Text> : null}
          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
            {list.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" onPress={() => { setMsg(null); setDraft(toDraft(p)); }} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12, opacity: p.inStock ? 1 : 0.55 }]}>
                {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={{ width: 48, height: 48, borderRadius: 10 }} contentFit="cover" /> : <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#F2F1EC' }} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.body}>{p.name}</Text>
                  <Text style={styles.muted}>
                    {p.sku ? `${p.sku} · ` : ''}
                    {formatAmd(p.price)} / {p.unit} · min {p.minQty}
                    {p.inStock ? '' : ' · Չկա'}
                  </Text>
                </View>
                <Text style={{ color: colors.textMuted }}>›</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[styles.muted, { textAlign: 'center', paddingBottom: 12 }]}>CSV սյուներ՝ name, unit, price, min_qty, step, pack_note</Text>
        </>
      )}
    </Screen>
  );
}
