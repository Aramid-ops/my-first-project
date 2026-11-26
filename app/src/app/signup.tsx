// Խանութի գրանցում՝ մեկ անգամ, ամբողջական տվյալներով (SPEC §4.3.1)
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Button, Card, Chips, Field, Screen, styles, Title } from '@/lib/ui';

const districts = ['Աջափնյակ', 'Ավան', 'Արաբկիր', 'Դավթաշեն', 'Էրեբունի', 'Կենտրոն', 'Մալաթիա-Սեբաստիա', 'Նոր Նորք', 'Նորք-Մարաշ', 'Նուբարաշեն', 'Շենգավիթ', 'Քանաքեռ-Զեյթուն'];

export default function SignUp() {
  const [f, setF] = useState({ name: '', legal_name: '', tax_id: '', district: '', address: '', phone: '', contact_person: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [kind, setKind] = useState<'shop' | 'employee'>('shop');
  const [code, setCode] = useState('');
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const problem =
    !f.name || !f.legal_name ? 'Լրացրեք անվանումները'
    : !/^\d{8}$/.test(f.tax_id) ? 'ՀՎՀՀ-ն պետք է լինի 8 թիվ'
    : !f.district || !f.address ? 'Լրացրեք հասցեն'
    : f.phone.replace(/\D/g, '').length < 8 ? 'Լրացրեք հեռախոսը'
    : !/^\S+@\S+\.\S+$/.test(f.email) ? 'Լրացրեք էլ. փոստը'
    : f.password.length < 8 ? 'Գաղտնաբառը՝ առնվազն 8 նիշ'
    : null;

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
        <Title sub={kind === 'shop' ? 'Մեկ անգամ, և մատակարարները կտեսնեն ձեր տվյալները' : 'Ղեկավարից ստացած 6-նիշ կոդով'}>Գրանցում</Title>
        <Chips options={[{ value: 'shop', label: 'Խանութ / ռեստորան' }, { value: 'employee', label: 'Աշխատող եմ (ունեմ կոդ)' }]} value={kind} onChange={setKind} />
        {kind === 'employee' ? (
          <Card style={{ gap: 12 }}>
            <Field label="Հրավերի կոդ" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" />
            <Field label="Էլ. փոստ" value={f.email} onChangeText={set('email')} keyboardType="email-address" />
            <Field label="Գաղտնաբառ" value={f.password} onChangeText={set('password')} secure />
            {msg ? <Text style={{ color: msg.ok ? colors.primary : colors.warnText, textAlign: 'center' }}>{msg.text}</Text> : null}
            <Button
              label={busy ? 'Գրանցում…' : 'Գրանցվել'}
              disabled={busy || code.length !== 6 || !/^\S+@\S+\.\S+$/.test(f.email) || f.password.length < 8}
              onPress={async () => {
                setBusy(true);
                const { data: res, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { kind: 'employee', code } } });
                setBusy(false);
                if (error) setMsg({ ok: false, text: error.message });
                else if (!res.session) setMsg({ ok: true, text: 'Հաստատեք էլ. փոստը (նամակ ենք ուղարկել), հետո մուտք գործեք' });
                else router.replace('/');
              }}
            />
          </Card>
        ) : null}
        {kind === 'shop' ? (<>
        <Card style={{ gap: 12 }}>
          <Field label="Ցուցանակի անուն (օր.՝ Սրճարան «Կետ»)" value={f.name} onChangeText={set('name')} />
          <Field label="Իրավաբանական անվանում (օր.՝ «Կետ» ՍՊԸ)" value={f.legal_name} onChangeText={set('legal_name')} />
          <Field label="ՀՎՀՀ" value={f.tax_id} onChangeText={(v) => set('tax_id')(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" />
        </Card>
        <Card style={{ gap: 12 }}>
          <Text style={styles.muted}>Երևանի թաղամաս</Text>
          <Chips options={districts.map((d) => ({ value: d, label: d }))} value={f.district} onChange={set('district')} />
          <Field label="Հասցե" value={f.address} onChangeText={set('address')} />
        </Card>
        <Card style={{ gap: 12 }}>
          <Field label="Հեռախոս" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+374 ..." />
          <Field label="Կոնտակտային անձ" value={f.contact_person} onChangeText={set('contact_person')} />
          <Field label="Էլ. փոստ (մուտքի համար)" value={f.email} onChangeText={set('email')} keyboardType="email-address" />
          <Field label="Գաղտնաբառ" value={f.password} onChangeText={set('password')} secure />
        </Card>

        {msg ? <Text style={{ color: msg.ok ? colors.primary : colors.warnText, textAlign: 'center' }}>{msg.text}</Text> : null}
        {problem && Object.values(f).some(Boolean) ? <Text style={[styles.muted, { textAlign: 'center' }]}>{problem}</Text> : null}
        <Button
          label={busy ? 'Գրանցում…' : 'Գրանցվել'}
          disabled={busy || !!problem}
          onPress={async () => {
            setBusy(true);
            const { password, ...data } = f;
            const { data: res, error } = await supabase.auth.signUp({
              email: f.email.trim(),
              password,
              options: { data: { kind: 'shop', city: 'Երևան', ...data } },
            });
            setBusy(false);
            if (error) setMsg({ ok: false, text: error.message });
            else if (!res.session) setMsg({ ok: true, text: 'Գրեթե պատրաստ է. հաստատեք էլ. փոստը (նամակ ենք ուղարկել), հետո մուտք գործեք' });
            else router.replace('/');
          }}
        />
        </>) : null}
        <Button kind="outline" label="Արդեն ունեմ հաշիվ" onPress={() => router.replace('/')} />
      </ScrollView>
    </Screen>
  );
}
