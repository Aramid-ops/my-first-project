// Մուտք էլ. փոստով և գաղտնաբառով (Supabase Auth)
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { useStore } from '@/lib/store';
import { colors, radius } from '@/lib/theme';
import { Button, Card, Screen, styles } from '@/lib/ui';

export default function SignIn() {
  const { ready, session, signIn, signOut, userEmail } = useStore();
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
  if (session?.kind === 'employee') return <Redirect href="/manager" />;

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
            <Button kind="outline" label="Դուրս գալ" onPress={signOut} />
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <Text style={styles.muted} nativeID="email-label">Էլ. փոստ</Text>
            <TextInput
              accessibilityLabelledBy="email-label"
              accessibilityLabel="Էլ. փոստ"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              style={input}
            />
            <Text style={styles.muted} nativeID="pw-label">Գաղտնաբառ</Text>
            <TextInput
              accessibilityLabelledBy="pw-label"
              accessibilityLabel="Գաղտնաբառ"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              style={input}
            />
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
          </Card>
        )}
      </View>
    </Screen>
  );
}

const input = {
  minHeight: 48,
  borderWidth: 1,
  borderColor: colors.borderStrong,
  borderRadius: radius.md,
  paddingHorizontal: 14,
  fontSize: 16,
  backgroundColor: colors.card,
  color: colors.text,
} as const;
