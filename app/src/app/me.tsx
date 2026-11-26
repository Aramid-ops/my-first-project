// Անկախ վարորդի էջը (ֆիրմայի աշխատող չէ)։ Այս էջը հետո կմշակենք (պատվերներ, փոխադրումներ)։
import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { InviteButton } from '@/components/invite-button';
import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Card, Screen, styles, Title } from '@/lib/ui';

const vehicleLabel: Record<string, string> = { car: 'Մարդատար', van: 'Ֆուրգոն', truck: 'Բեռնատար' };

export default function Me() {
  const { session, driverProfile: d, signOut } = useStore();
  if (session?.kind !== 'driverSelf' || !d) return <Redirect href="/" />;
  const rows: [string, string | undefined][] = [
    ['Հեռախոս', d.phone],
    ['Հասցե', d.address],
    ['Վարորդական իրավունք', d.licenseCategories.join(', ') || undefined],
    ['Մեքենա', [d.vehicleType ? vehicleLabel[d.vehicleType] ?? d.vehicleType : undefined, d.vehicleModel].filter(Boolean).join(' · ') || undefined],
    ['Համարանիշ', d.plate],
    ['Բեռնատարողություն', d.capacityKg ? (d.capacityKg >= 1000 ? `${d.capacityKg / 1000} տ` : `${d.capacityKg} կգ`) : undefined],
    ['Սառնարանային', d.refrigerated ? 'Այո' : 'Ոչ'],
  ];
  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.dark }}>Մատակարար</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <InviteButton />
          <Pressable accessibilityRole="button" onPress={() => { signOut(); router.replace('/'); }} hitSlop={12}>
            <Text style={styles.muted}>Դուրս գալ</Text>
          </Pressable>
        </View>
      </View>
      <Title sub="Վարորդ">{d.name}</Title>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        <Card style={{ gap: 10 }}>
          {rows.map(([k, v]) =>
            v ? (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text style={styles.muted}>{k}</Text>
                <Text style={[styles.body, { flexShrink: 1, textAlign: 'right' }]}>{v}</Text>
              </View>
            ) : null,
          )}
        </Card>
        <Card style={{ gap: 6 }}>
          <Text style={styles.strong}>Աշխատանք ֆիրմայում</Text>
          <Text style={styles.muted}>Եթե ֆիրման ձեզ հրավիրել է, սեղմեք վերևում «🔑 Կոդ» և գրեք նրա տված կոդը։ Դրանից հետո կտեսնեք ձեր կանգառները։</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}
