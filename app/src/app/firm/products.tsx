// Ֆիրմայի ապրանքներ (📦 «Ապրանքներ» իրավունքով). ավելացնել, փոխել, նկար, «Չկա», Excel/CSV ներմուծում՝ նախադիտումով
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import readXlsxFile from 'read-excel-file/universal';

import { categories } from '@/lib/categories';
import { pickAndUpload } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import { buildPreview, csvRows, type ImportPreview } from '@/lib/product-import';
import { formatAmd } from '@/lib/rules';
import { matches } from '@/lib/search';
import { useStore } from '@/lib/store';
import { colors, radius } from '@/lib/theme';
import { units, type Product, type Unit } from '@/lib/types';

// Նմուշը դրված է կայքում (public/products-template.xlsx)
const TEMPLATE_URL = 'https://aramid-ops.github.io/my-first-project/products-template.xlsx';
import { Button, Card, Chips, Field, Screen, styles, Title } from '@/lib/ui';

type Draft = { id?: string; stockQty?: string; name: string; unit: Unit; packNote: string; price: string; minQty: string; step: string; weighed: boolean; inStock: boolean; imageUrl?: string; category?: string; categoryAuto: boolean };
const empty: Draft = { name: '', unit: 'հատ', packNote: '', price: '', minQty: '1', step: '1', weighed: false, inStock: true, categoryAuto: true };
const toDraft = (p: Product): Draft => ({ id: p.id, name: p.name, unit: p.unit, packNote: p.packNote ?? '', price: String(p.price), minQty: String(p.minQty), step: String(p.step), weighed: !!p.weighed, inStock: p.inStock, imageUrl: p.imageUrl, category: p.category, categoryAuto: p.categoryAuto !== false });

/** Վեբում՝ ուղիղ ներբեռնում (ոչ թե բացում Excel Online-ում), հեռախոսում՝ բրաուզերով */
function downloadTemplate() {
  if (Platform.OS !== 'web') return Linking.openURL(TEMPLATE_URL);
  const a = document.createElement('a');
  a.href = TEMPLATE_URL.replace('https://aramid-ops.github.io', location.origin);
  a.download = 'matakarar-apranqner.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function FirmProducts() {
  const { session, employees, products, saveProduct, perms, reload } = useStore();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [newCat, setNewCat] = useState<string | null>(null);
  // «միացնել» → պահեստում քանակ չկա → հարցնում ենք քանակը
  const [activate, setActivate] = useState<{ id: string; qty: string } | null>(null);
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const me = session?.kind === 'employee' ? employees.find((e) => e.id === session.employeeId) : undefined;
  if (!me || !perms.includes('products')) return <Redirect href="/" />;
  const list = products.filter((p) => p.firmId === me.firmId && (matches(p.name, filter) || (p.sku ?? '').toLowerCase().startsWith(filter.trim().toLowerCase())));
  // Կատեգորիաներով խմբավորված (այբբենական, «Այլ»-ը՝ վերջում)
  const groups = Object.entries(
    list.reduce<Record<string, Product[]>>((g, p) => ((g[p.category || 'Այլ'] ??= []).push(p), g), {}),
  ).sort(([a], [b]) => (a === 'Այլ' ? 1 : b === 'Այլ' ? -1 : a.localeCompare(b, 'hy')));
  // ստանդարտ + ֆիրմայի իր (նոր) կատեգորիաները
  const allCats = [...new Set([...categories, ...products.filter((p) => p.firmId === me.firmId && p.category).map((p) => p.category!)])];
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
      category: draft.category,
      categoryAuto: draft.categoryAuto,
    });
    // նոր ապրանք + քանակ պահեստում → մուտք (ապրանքը միանգամից «Կա» է դառնում)
    let stockErr: string | null = null;
    if (!err && !draft.id && num(draft.stockQty ?? '') > 0) {
      const { data } = await supabase.from('products').select('id').eq('firm_id', me.firmId).eq('name', draft.name.trim()).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) stockErr = await addStock(data.id, num(draft.stockQty!));
    }
    setBusy(false);
    setMsg(err ?? stockErr);
    if (!err) setDraft(null);
  };

  const addStock = async (productId: string, qty: number) => {
    const { error } = await supabase.from('stock_moves').insert({ firm_id: me.firmId, product_id: productId, qty, kind: 'in', employee_id: me.id, note: 'Առաջին մուտք' });
    await reload();
    return error ? (perms.includes('stock') ? error.message : 'Պահեստում քանակ նշելու թույլտվություն չունեք (📦 Պահեստ)') : null;
  };

  // 1) ընտրել ֆայլ → 2) նախադիտում → 3) հաստատել
  const pickFile = async () => {
    setMsg(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
    });
    const f = res.canceled ? null : res.assets?.[0];
    if (!f) return;
    try {
      const buf = await (await fetch(f.uri)).arrayBuffer();
      const isXlsx = /\.xlsx$/i.test(f.name) || new Uint8Array(buf.slice(0, 2)).join() === '80,75'; // «PK» = zip
      const table = isXlsx ? (await readXlsxFile(buf))[0]?.data ?? [] : csvRows(new TextDecoder().decode(buf));
      setPreview(buildPreview(table as unknown[][], products.filter((p) => p.firmId === me.firmId)));
    } catch {
      setMsg('Ֆայլը չհաջողվեց կարդալ։ Պահեք .xlsx կամ .csv ձևաչափով (ներբեռնեք նմուշը)');
    }
  };

  const runImport = async () => {
    if (!preview) return;
    setBusy(true);
    let ok = 0;
    const errors = [...preview.errors];
    for (const r of preview.rows) {
      const err = await saveProduct({
        id: r.existing?.id,
        firmId: me.firmId,
        name: r.name,
        unit: r.unit,
        price: r.price,
        minQty: r.minQty,
        step: r.step,
        packNote: r.packNote || r.existing?.packNote || '',
        weighed: r.existing?.weighed ?? (r.unit === 'կգ' || r.unit === 'գ'),
        inStock: r.existing?.inStock ?? false, // նորը՝ «Չկա», մինչև պահեստում քանակ նշեք
        imageUrl: r.existing?.imageUrl,
        category: r.category ?? r.existing?.category,
        categoryAuto: r.category ? false : r.existing?.categoryAuto ?? true,
      });
      if (err) errors.push(`${r.name}: ${err}`);
      else ok++;
    }
    setBusy(false);
    setPreview(null);
    setMsg(`✓ Ներմուծված է՝ ${ok}${errors.length ? ` · չներմուծված՝ ${errors.length}` : ''}`);
  };

  // Անջատել՝ միշտ; միացնել՝ եթե պահեստում կա, այլապես հարցնում ենք քանակը
  const toggleStock = async (p: Product, on: boolean) => {
    setMsg(null);
    const err = await saveProduct({ ...p, inStock: on });
    if (err && on && err.includes('պահեստում')) setActivate({ id: p.id, qty: '' });
    else setMsg(err);
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title sub={`${list.length} ապրանք`}>Ապրանքներ</Title>
      </View>

      {preview ? (
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 40 }}>
          <Card style={{ gap: 6 }}>
            <Text style={styles.strong}>Նախադիտում</Text>
            <Text style={styles.body}>🆕 Նոր ապրանք՝ {preview.added.length}</Text>
            <Text style={styles.body}>🔄 Թարմացվող՝ {preview.updated.length}</Text>
            {preview.priceChanges.length ? <Text style={[styles.body, { color: colors.warnText }]}>💰 {preview.priceChanges.length} ապրանքի գինը կփոխվի</Text> : null}
            {preview.added.length ? <Text style={styles.muted}>Նոր ապրանքները կլինեն «Չկա», մինչև պահեստում քանակ նշեք (📦 կամ միացնելով)</Text> : null}
            {preview.newCategories.length ? <Text style={styles.body}>🏷 Նոր կատեգորիա՝ {preview.newCategories.join(', ')}</Text> : null}
            {preview.errors.length ? <Text style={[styles.body, { color: colors.warnText }]}>⚠️ Սխալ տողեր՝ {preview.errors.length} (չեն ներմուծվի)</Text> : null}
          </Card>
          {preview.priceChanges.length ? (
            <Card style={{ gap: 4 }}>
              <Text style={styles.strong}>Գների փոփոխություն</Text>
              {preview.priceChanges.map((c) => (
                <Text key={c.name} style={styles.body}>
                  {c.name}՝ {formatAmd(c.from)} → <Text style={{ fontWeight: '700', color: c.to > c.from ? colors.warnText : colors.primary }}>{formatAmd(c.to)}</Text>
                </Text>
              ))}
            </Card>
          ) : null}
          {preview.added.length ? (
            <Card style={{ gap: 4 }}>
              <Text style={styles.strong}>Նոր ապրանքներ</Text>
              {preview.added.map((r) => (
                <Text key={r.line} style={styles.body}>{r.name} · {formatAmd(r.price)} / {r.unit}</Text>
              ))}
            </Card>
          ) : null}
          {preview.errors.length ? (
            <Card style={{ gap: 4 }}>
              <Text style={styles.strong}>Սխալներ</Text>
              {preview.errors.map((e) => (
                <Text key={e} style={[styles.body, { color: colors.warnText }]}>{e}</Text>
              ))}
            </Card>
          ) : null}
          <Button label={busy ? 'Ներմուծվում է…' : `✓ Հաստատել (${preview.rows.length})`} disabled={busy || !preview.rows.length} onPress={runImport} />
          <Button kind="outline" label="Չեղարկել" onPress={() => setPreview(null)} />
        </ScrollView>
      ) : draft ? (
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
            <Text style={styles.muted}>Կատեգորիա{draft.categoryAuto ? ' (ընտրվում է ինքնաբերաբար՝ ըստ անվան)' : ''}</Text>
            <Chips
              options={[
                { value: '__auto', label: draft.categoryAuto && draft.category ? `Ավտոմատ · ${draft.category}` : 'Ավտոմատ' },
                ...allCats.map((c) => ({ value: c, label: c })),
                { value: '__new', label: '+ Նոր կատեգորիա' },
              ]}
              value={newCat !== null ? '__new' : draft.categoryAuto ? '__auto' : draft.category ?? '__auto'}
              onChange={(v) => {
                setNewCat(v === '__new' ? '' : null);
                if (v !== '__new') set(v === '__auto' ? { categoryAuto: true } : { category: v, categoryAuto: false });
              }}
            />
            {newCat !== null ? (
              <Field label="Նոր կատեգորիա" value={newCat} placeholder="Օր.՝ Ավտոյի պահեստամասեր" autoComplete="off"
                onChangeText={(v) => { setNewCat(v); set(v.trim() ? { category: v.trim(), categoryAuto: false } : { categoryAuto: true }); }} />
            ) : null}
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
            {!draft.id ? (
              <Field label="Քանի՞ կա պահեստում (որ երևա խանութներին)" value={draft.stockQty ?? ''} onChangeText={(v) => set({ stockQty: v.replace(/[^\d.,]/g, '') })}
                keyboardType="number-pad" placeholder="Դատարկ՝ «Չկա», հետո կնշեք" />
            ) : null}
          </Card>
          {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
          <Button label={busy ? 'Պահվում է…' : 'Պահել'} disabled={busy || !draft.name.trim() || !num(draft.price)} onPress={save} />
          <Button kind="outline" label="Չեղարկել" onPress={() => setDraft(null)} />
        </ScrollView>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <Button label="+ Նոր ապրանք" onPress={() => { setMsg(null); setNewCat(null); setDraft({ ...empty }); }} style={{ flex: 1 }} />
            <Button kind="outline" label="📊 Ներմուծել Excel-ից" onPress={pickFile} style={{ flex: 1 }} />
          </View>
          <Pressable accessibilityRole="button" onPress={downloadTemplate} hitSlop={8} style={{ marginBottom: 10 }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>📥 Ներբեռնել նմուշը (Excel)</Text>
          </Pressable>
          <TextInput placeholderTextColor={colors.textMuted} importantForAutofill="no"
            accessibilityLabel="Որոնել ապրանք"
            placeholder="Որոնել ապրանք կամ արտիկուլ"
            value={filter}
            onChangeText={setFilter}
            style={{ minHeight: 46, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 15, backgroundColor: colors.card, marginBottom: 10, color: colors.text }}
          />
          {msg ? <Text style={{ color: colors.primary, marginBottom: 8 }}>{msg}</Text> : null}
          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
            {!list.length ? <Text style={styles.muted}>Ապրանք չկա</Text> : null}
            {groups.map(([cat, items]) => (
              <View key={cat} style={{ gap: 8 }}>
                <Text style={[styles.strong, { fontSize: 15, marginTop: 6 }]}>
                  {cat} <Text style={styles.muted}>· {items.length}</Text>
                </Text>
                {items.map((p) => (
                  <View key={p.id} style={[styles.card, { gap: 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Pressable accessibilityRole="button" onPress={() => { setMsg(null); setNewCat(null); setActivate(null); setDraft(toDraft(p)); }}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: p.inStock ? 1 : 0.6 }}>
                        {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={{ width: 44, height: 44, borderRadius: 10 }} contentFit="cover" /> : <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#F2F1EC' }} />}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.body}>{p.name}</Text>
                          <Text style={styles.muted}>
                            {p.sku ? `${p.sku} · ` : ''}
                            {formatAmd(p.price)} / {p.unit} · min {p.minQty}
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Պահեստ՝ ${p.name}`} onPress={() => router.push(`/firm/stock?product=${p.id}`)} hitSlop={6}
                        style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ fontSize: 13 }}>📦</Text>
                      </Pressable>
                      <View style={{ alignItems: 'center' }}>
                        <Switch value={p.inStock} onValueChange={(v) => toggleStock(p, v)} accessibilityLabel={`${p.name}՝ ${p.inStock ? 'Կա' : 'Չկա'}`} />
                        <Text style={{ fontSize: 11, color: p.inStock ? colors.primary : colors.textMuted }}>{p.inStock ? 'Կա' : 'Չկա'}</Text>
                      </View>
                    </View>
                    {activate?.id === p.id ? (
                      <View style={{ gap: 8, backgroundColor: '#FBF3EC', borderRadius: radius.md, padding: 10 }}>
                        <Text style={styles.body}>📦 Որ ապրանքը երևա խանութներին, նշեք՝ քանի՞ {p.unit} կա պահեստում</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TextInput placeholderTextColor={colors.textMuted} importantForAutofill="no" accessibilityLabel="Քանակ պահեստում" placeholder={`Քանակ, ${p.unit}`} value={activate.qty}
                            onChangeText={(v) => setActivate({ ...activate, qty: v.replace(/[^\d.,]/g, '') })} keyboardType="number-pad"
                            style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: 10, backgroundColor: colors.card, color: colors.text }} />
                          <Button label="Միացնել" disabled={!(num(activate.qty) > 0)} onPress={async () => { const e = await addStock(p.id, num(activate.qty)); setMsg(e); if (!e) setActivate(null); }} />
                          <Button kind="outline" label="✕" onPress={() => setActivate(null)} />
                        </View>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </Screen>
  );
}
