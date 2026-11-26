// Մուտք էլ. փոստով և գաղտնաբառով (Supabase Auth)
import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Button, Card, Field, Screen, styles } from '@/lib/ui';

export default function SignIn() {
  const { ready, session, signIn, signOut, userEmail, reload } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.dark} />
        </View>
      </Screen>
    );
  }
  if (session?.kind === 'shop') return <Redirect href="/shop" />;
  if (session?.kind === 'employee')
    return <Redirect href={session.role === 'driver' ? '/driver' : session.role === 'admin' ? '/admin' : '/manager'} />;

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
        <View style={{ gap: 6, marginBottom: 8 }}>
          <Text style={{ fontSize: 34, fontWeight: '700', color: colors.dark }}>Մատակարար</Text>
          <Text style={styles.muted}>Մուտք գործեք ձեր հաշվով</Text>
        </View>

        {session?.kind === 'none' ? (
          <Card style={{ gap: 12 }}>
            <Text style={styles.body}>{userEmail} հաշիվը դեռ կցված չէ որևէ խանութի կամ ֆիրմայի։</Text>
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
                setBusy(false);
                if (err) setError('Սխալ էլ. փոստ կամ գաղտնաբառ');
              }}
            />
            <Link href="/signup" style={{ textAlign: 'center', color: colors.primary, fontWeight: '600', paddingVertical: 8 }}>
              Նոր խանութ եք. գրանցվել
            </Link>
          </Card>
        )}
      </View>
    </Screen>
  );
}

