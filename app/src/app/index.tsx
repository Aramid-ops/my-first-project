// Մուտք էլ. փոստով և գաղտնաբառով (Supabase Auth)
import { Image } from 'expo-image';
import { Link, Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { BrandSplash } from '@/components/brand-splash';

import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Button, Card, Field, Screen, styles } from '@/lib/ui';

export default function SignIn() {
  const { ready, session, signIn, signOut, userEmail, reload } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimPending, setClaimPending] = useState(false);
  // մուտքից հետո, երբ տվյալները եկան՝ բրենդի էկրանը փակվում է
  useEffect(() => {
    if (session) setBusy(false);
  }, [session]);
  useEffect(() => {
    if (session?.kind !== 'none') return;
    supabase.from('firm_claims').select('status').eq('status', 'pending').then(({ data }) => setClaimPending(!!data?.length));
    // հարթակի ադմին → ստուգումների էջ
    supabase.from('platform_admins').select('user_id').maybeSingle().then(({ data }) => { if (data) router.replace('/platform'); });
  }, [session]);

  // բեռնվելիս և մուտք գործելիս՝ բրենդի էկրանը
  if (!ready || (busy && !session)) return <BrandSplash />;
  if (session?.kind === 'shop') return <Redirect href="/shop" />;
  if (session?.kind === 'driverSelf') return <Redirect href="/me" />;
  if (session?.kind === 'employee')
    return <Redirect href={session.role === 'driver' ? '/driver' : session.role === 'admin' ? '/admin' : '/manager'} />;

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
        <View style={{ gap: 6, marginBottom: 8 }}>
          <Image
            source={require('../../assets/images/splash-icon.png')}
            tintColor={colors.dark}
            contentFit="contain"
            accessibilityLabel="Մատակարար"
            style={{ width: 110, height: 110, alignSelf: 'center', marginBottom: 12 }}
          />
          <Text style={[styles.muted, { textAlign: 'center' }]}>Մուտք գործեք ձեր հաշվով</Text>
        </View>

        {session?.kind === 'none' ? (
          <Card style={{ gap: 12 }}>
            <Text style={styles.body}>
              {claimPending
                ? 'Ձեր ֆիրմայի հայտը ստուգվում է. հաստատելուց հետո կտեսնեք ֆիրմայի էջը (սովորաբար՝ նույն օրը)։'
                : `${userEmail} հաշիվը դեռ կցված չէ որևէ խանութի կամ ֆիրմայի։`}
            </Text>
            <Button label="Թարմացնել" onPress={reload} />
            <Button kind="outline" label="Դուրս գալ" onPress={signOut} />
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <Field label="Էլ. փոստ" value={email} onChangeText={setEmail} keyboardType="email-address" />
            <Field label="Գաղտնաբառ" value={password} onChangeText={setPassword} secure />
            {error ? <Text style={{ color: colors.warnText }}>{error}</Text> : null}
            <Button
              label={busy ? 'Մուտք…' : 'Մուտք'}
              disabled={busy || !email || !password}
              onPress={async () => {
                setBusy(true);
                setError(null);
                const err = await signIn(email, password);
                if (err) {
                  setBusy(false);
                  setError('Սխալ էլ. փոստ կամ գաղտնաբառ');
                }
              }}
            />
            <Link href="/signup" style={{ textAlign: 'center', color: colors.primary, fontWeight: '600', paddingVertical: 8 }}>
              Չունեք հաշիվ. գրանցվել
            </Link>
          </Card>
        )}
      </View>
    </Screen>
  );
}

