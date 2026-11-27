// Գրանցում. 4 ճանապարհ (SPEC §4.3.2)։ Ամեն մեկից հարցնում ենք միայն այն, ինչ նա իրականում ունի։
//   🏪 Խանութ / ռեստորան — ՀՎՀՀ, հասցե
//   👔 Մատակարար (մենեջեր) — ընտրում է ֆիրման կամ գրում նորի անունը. ՀՎՀՀ և հասցե պետք չեն
//   🏢 Ֆիրմա — իրավաբանական տվյալներ; կարող է «վերցնել» արդեն գրանցված մենեջերների ֆիրման
//   🚚 Աշխատող — միայն հրավերի կոդ
import { router } from 'expo-router';
import { districts } from '@/lib/districts';
import { isValidPhone, normalizePhone } from '@/lib/rules';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { startsWithWord } from '@/lib/search';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Button, Card, Chips, Field, Screen, styles, Title } from '@/lib/ui';

type Kind = 'shop' | 'manager' | 'firm' | 'driver' | 'employee';
type PubFirm = { id: string; name: string; category: string | null; status: string };

const kinds: { value: Kind; label: string }[] = [
  { value: 'shop', label: '🏪 Խանութ / ռեստորան' },
  { value: 'manager', label: '👔 Մատակարար (մենեջեր)' },
  { value: 'firm', label: '🏢 Ֆիրմա' },
  { value: 'driver', label: '🚗 Վարորդ' },
  { value: 'employee', label: '🔑 Ֆիրմայի աշխատող (կոդով)' },
];

const emailOk = (e: string) => /^\S+@\S+\.\S+$/.test(e);
const phoneOk = isValidPhone;

export default function SignUp() {
  const [kind, setKind] = useState<Kind>('shop');
  const [f, setF] = useState({
    name: '', phone: '', email: '', password: '',
    shop_name: '', legal_name: '', tax_id: '', district: '', address: '', contact_person: '',
    firm_id: '', firm_name: '', category: '', code: '',
    vehicle_type: '', vehicle_model: '', plate: '', capacity_kg: '',
  });
  const [licenses, setLicenses] = useState<string[]>([]);
  const [fridge, setFridge] = useState(false);
  const [firms, setFirms] = useState<PubFirm[]>([]);
  const [firmQuery, setFirmQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    supabase.rpc('public_firms').then(({ data }) => setFirms((data ?? []) as PubFirm[]));
  }, []);

  const common = !f.name.trim() ? 'Լրացրեք անունը' : !phoneOk(f.phone) ? 'Հեռախոսը սխալ է (օր.՝ +374 77 123456)' : !emailOk(f.email) ? 'Լրացրեք էլ. փոստը' : f.password.length < 8 ? 'Գաղտնաբառը՝ առնվազն 8 նիշ' : null;
  const problem =
    kind === 'employee' ? (f.code.length !== 6 ? 'Գրեք 6-նիշ կոդը' : !emailOk(f.email) ? 'Լրացրեք էլ. փոստը' : f.password.length < 8 ? 'Գաղտնաբառը՝ առնվազն 8 նիշ' : null)
    : kind === 'shop' ? (!f.shop_name ? 'Լրացրեք անունը' : !/^\d{8}$/.test(f.tax_id) ? 'ՀՎՀՀ-ն պետք է լինի 8 թիվ' : !f.district || !f.address ? 'Լրացրեք հասցեն' : common)
    : kind === 'manager' ? (!f.firm_id && !f.firm_name.trim() ? 'Ընտրեք կամ գրեք ֆիրման' : common)
    : kind === 'driver' ? (licenses.length === 0 ? 'Նշեք վարորդական իրավունքի կարգը' : !f.vehicle_type ? 'Ընտրեք մեքենայի տեսակը' : common)
    : !f.firm_name.trim() ? 'Լրացրեք ֆիրմայի անունը' : f.tax_id && !/^\d{8}$/.test(f.tax_id) ? 'ՀՎՀՀ-ն պետք է լինի 8 թիվ' : common;

  const metadata = () => {
    switch (kind) {
      case 'shop':
        return { kind, name: f.shop_name, legal_name: f.legal_name || f.shop_name, tax_id: f.tax_id, city: 'Երևան', district: f.district, address: f.address, phone: normalizePhone(f.phone), email: f.email, contact_person: f.contact_person || f.name };
      case 'manager':
        return { kind, name: f.name, phone: normalizePhone(f.phone), firm_id: f.firm_id || null, firm_name: f.firm_name, category: f.category };
      case 'driver':
        return { kind, name: f.name, phone: normalizePhone(f.phone), address: f.address, license_categories: licenses, vehicle_type: f.vehicle_type, vehicle_model: f.vehicle_model, plate: f.plate, capacity_kg: f.capacity_kg, refrigerated: fridge };
      case 'firm':
        return { kind, name: f.name, phone: normalizePhone(f.phone), firm_id: f.firm_id || null, firm_name: f.firm_name, legal_name: f.legal_name || f.firm_name, tax_id: f.tax_id, address: f.address, category: f.category };
      default:
        return { kind, code: f.code };
    }
  };

  // Ֆիրմայի ընտրություն. մենեջերի համար՝ բոլորը, ֆիրմայի համար՝ միայն դեռ չգրանցվածները (մենեջերների ստեղծած)
  const firmOptions = firms
    .filter((x) => (kind === 'firm' ? x.status === 'unclaimed' : true))
    .filter((x) => !firmQuery.trim() || startsWithWord(x.name, firmQuery))
    .slice(0, 12);

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
        <Title sub="Ընտրեք, թե ով եք">Գրանցում</Title>
        <Chips options={kinds} value={kind} onChange={(k) => { setKind(k); setMsg(null); setF((x) => ({ ...x, firm_id: '' })); }} />

        {kind === 'employee' ? (
          <Card style={{ gap: 12 }}>
            <Text style={styles.muted}>Կոդը տալիս է ձեր ֆիրմայի ղեկավարը. այն որոշում է ֆիրման և ձեր դերը</Text>
            <Field label="Հրավերի կոդ" value={f.code} onChangeText={(v) => set('code')(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" />
          </Card>
        ) : null}

        {kind === 'shop' ? (
          <>
            <Card style={{ gap: 12 }}>
              <Field label="Խանութի անուն (օր.՝ Սրճարան «Կետ»)" value={f.shop_name} onChangeText={set('shop_name')} />
              <Field label="Իրավաբանական անվանում՝ միայն եթե տարբեր է (օր.՝ «Կետ» ՍՊԸ)" value={f.legal_name} onChangeText={set('legal_name')} />
              <Field label="ՀՎՀՀ" value={f.tax_id} onChangeText={(v) => set('tax_id')(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" />
            </Card>
            <Card style={{ gap: 12 }}>
              <Text style={styles.muted}>Երևանի թաղամաս</Text>
              <Chips options={districts.map((d) => ({ value: d, label: d }))} value={f.district} onChange={set('district')} />
              <Field label="Հասցե" value={f.address} onChangeText={set('address')} />
            </Card>
          </>
        ) : null}

        {kind === 'driver' ? (
          <Card style={{ gap: 12 }}>
            <Text style={styles.muted}>Վարորդական իրավունքի կարգ (կարելի է մի քանիսը)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['B', 'C1', 'C', 'CE', 'D'].map((c) => {
                const on = licenses.includes(c);
                return (
                  <Pressable
                    key={c}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => setLicenses(on ? licenses.filter((x) => x !== c) : [...licenses, c])}
                    style={{ minWidth: 52, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: on ? colors.dark : colors.borderStrong, backgroundColor: on ? colors.dark : colors.card }}>
                    <Text style={{ color: on ? '#FFFFFF' : colors.text, fontWeight: '600' }}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.muted}>Մեքենա</Text>
            <Chips options={[{ value: 'car', label: 'Մարդատար' }, { value: 'van', label: 'Ֆուրգոն' }, { value: 'truck', label: 'Բեռնատար' }]} value={f.vehicle_type} onChange={set('vehicle_type')} />
            <Field label="Մակնիշ, մոդել (օր.՝ GAZelle Next)" value={f.vehicle_model} onChangeText={set('vehicle_model')} />
            <Field label="Համարանիշ" value={f.plate} onChangeText={set('plate')} />
            <Text style={styles.muted}>Բեռնատարողություն</Text>
            <Chips
              options={[['500', '0.5 տ'], ['1000', '1 տ'], ['1500', '1.5 տ'], ['3000', '3 տ'], ['5000', '5 տ'], ['10000', '10 տ'], ['20000', '20 տ']].map(([v, l]) => ({ value: v, label: l }))}
              value={f.capacity_kg}
              onChange={set('capacity_kg')}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.body}>Սառնարանային</Text>
              <Switch value={fridge} onValueChange={setFridge} />
            </View>
            <Field label="Հասցե" value={f.address} onChangeText={set('address')} />
          </Card>
        ) : null}

        {kind === 'manager' || kind === 'firm' ? (
          <Card style={{ gap: 12 }}>
            {/* Մեկ դաշտ. գրում եք անունը → ներքևում՝ համապատասխան ֆիրմաները. սեղմեք, եթե ձերն է; եթե չկա՝ գրածը կլինի նոր ֆիրմայի անունը */}
            <Field
              label={kind === 'manager' ? 'Ո՞ր ֆիրմայի մենեջերն եք' : 'Ֆիրմայի անուն'}
              value={f.firm_name}
              onChangeText={(v) => { setF((x) => ({ ...x, firm_name: v, firm_id: '' })); setFirmQuery(v); }}
              placeholder="Սկսեք գրել անունը"
            />
            {f.firm_id ? (
              <Text style={{ color: colors.primary, fontWeight: '600' }}>✓ Ընտրված է՝ {firms.find((x) => x.id === f.firm_id)?.name}</Text>
            ) : firmQuery.trim() && firmOptions.length ? (
              <View style={{ gap: 6 }}>
                <Text style={styles.muted}>{kind === 'manager' ? 'Ձեր ֆիրման ցուցակում է՞ սեղմեք' : 'Ձեր մենեջերներն արդեն գրանցե՞լ են ֆիրման. սեղմեք, և նրանք կմնան ձեզ մոտ'}</Text>
                {firmOptions.slice(0, 5).map((x) => (
                  <Pressable
                    key={x.id}
                    accessibilityRole="button"
                    onPress={() => setF((y) => ({ ...y, firm_id: x.id, firm_name: x.name }))}
                    style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card, paddingHorizontal: 14, justifyContent: 'center' }}>
                    <Text style={styles.body}>
                      {x.name}
                      {x.category ? <Text style={styles.muted}> · {x.category}</Text> : null}
                    </Text>
                  </Pressable>
                ))}
                <Text style={styles.muted}>Եթե ցուցակում չկա, պարզապես շարունակեք. կստեղծվի նոր ֆիրմա «{f.firm_name.trim()}» անունով</Text>
              </View>
            ) : null}
            {kind === 'firm' || !f.firm_id ? <Field label="Կատեգորիա (օր.՝ Կաթնամթերք)" value={f.category} onChangeText={set('category')} /> : null}
            {kind === 'firm' ? (
              <>
                <Field label="Իրավաբանական անվանում՝ միայն եթե տարբեր է (օր.՝ «Աթենք» ՍՊԸ)" value={f.legal_name} onChangeText={set('legal_name')} />
                <Field label="ՀՎՀՀ" value={f.tax_id} onChangeText={(v) => set('tax_id')(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" />
                <Field label="Պահեստի հասցե" value={f.address} onChangeText={set('address')} />
              </>
            ) : null}
          </Card>
        ) : null}

        <Card style={{ gap: 12 }}>
          {kind !== 'employee' ? (
            <>
              <Field label={kind === 'shop' ? 'Կոնտակտային անձ' : 'Ձեր անունը'} value={f.name} onChangeText={set('name')} autoComplete="name" />
              <Field label="Հեռախոս" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
            </>
          ) : null}
          <Field label="Էլ. փոստ (մուտքի համար)" value={f.email} onChangeText={set('email')} keyboardType="email-address" />
          <Field label="Գաղտնաբառ" value={f.password} onChangeText={set('password')} secure autoComplete="new-password" />
        </Card>

        {msg ? <Text style={{ color: msg.ok ? colors.primary : colors.warnText, textAlign: 'center' }}>{msg.text}</Text> : null}
        {problem && (f.email || f.name) ? <Text style={[styles.muted, { textAlign: 'center' }]}>{problem}</Text> : null}
        <Button
          label={busy ? 'Գրանցում…' : 'Գրանցվել'}
          disabled={busy || !!problem}
          onPress={async () => {
            setBusy(true);
            const { data: res, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: metadata() } });
            setBusy(false);
            if (error) setMsg({ ok: false, text: error.message });
            else if (!res.session) setMsg({ ok: true, text: 'Գրեթե պատրաստ է. հաստատեք էլ. փոստը (նամակ ենք ուղարկել), հետո մուտք գործեք' });
            else router.replace('/');
          }}
        />
        <Button kind="outline" label="Արդեն ունեմ հաշիվ" onPress={() => router.replace('/')} />
      </ScrollView>
    </Screen>
  );
}
