// Մուտք։ Առայժմ՝ փորձնական (ընտրում ես ով ես)։
// Supabase-ը միացնելուց հետո այստեղ կլինի մուտք հեռախոսահամարով / էլ. փոստով։
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Button, Card, Screen, styles } from '@/lib/ui';

export default function SignIn() {
  const { signIn, shops, employees, firms } = useStore();
  const shop = shops[0];
  const karen = employees.find((e) => e.id === 'e-karen')!;
  const firm = firms.find((f) => f.id === karen.firmId)!;

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
        <View style={{ gap: 6, marginBottom: 8 }}>
          <Text style={{ fontSize: 34, fontWeight: '700', color: colors.dark }}>Մատակարար</Text>
          <Text style={styles.muted}>Փորձնական տարբերակ · ընտրեք, թե ում անունից եք մտնում</Text>
        </View>

        <Card style={{ gap: 12 }}>
          <Text style={styles.strong}>🏪 Խանութ</Text>
          <Text style={styles.muted}>{shop.name}</Text>
          <Button
            label="Մտնել որպես խանութ"
            onPress={() => {
              signIn({ kind: 'shop', shopId: shop.id });
              router.replace('/shop');
            }}
          />
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={styles.strong}>👔 Մենեջեր</Text>
          <Text style={styles.muted}>
            {karen.name} · {firm.name}
          </Text>
          <Button
            kind="dark"
            label="Մտնել որպես մենեջեր"
            onPress={() => {
              signIn({ kind: 'employee', employeeId: karen.id });
              router.replace('/manager');
            }}
          />
        </Card>

        <Text style={[styles.muted, { textAlign: 'center' }]}>
          Խորհուրդ. պատվեր ուղարկեք որպես խանութ, հետո դուրս եկեք և մտեք որպես Կարեն
        </Text>
      </View>
    </Screen>
  );
}
