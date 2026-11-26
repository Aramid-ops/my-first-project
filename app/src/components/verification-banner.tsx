// Վարորդի նույնականացման վիճակը (բանների տեսքով)
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import { colors, radius } from '@/lib/theme';
import { Button, styles } from '@/lib/ui';

export function VerificationBanner() {
  const { driverProfile: d } = useStore();
  if (!d || d.verificationStatus === 'approved') return null;
  const pending = d.verificationStatus === 'pending';
  const rejected = d.verificationStatus === 'rejected';
  return (
    <View style={{ backgroundColor: pending ? colors.infoBg : colors.warnBg, borderRadius: radius.md, padding: 14, gap: 8, marginBottom: 10 }}>
      <Text style={[styles.strong, { color: pending ? colors.infoText : colors.warnText }]}>
        {pending ? '⏳ Նույնականացումը ստուգվում է' : rejected ? 'Նույնականացումը մերժվել է' : '🪪 Անցեք նույնականացում'}
      </Text>
      <Text style={{ color: colors.text, fontSize: 14 }}>
        {pending
          ? 'Սովորաբար՝ նույն օրը։ Արդյունքի մասին ծանուցում կստանաք։'
          : rejected
            ? `${d.verificationNote ? `Պատճառ՝ ${d.verificationNote}. ` : ''}Խնդրում ենք նորից ուղարկել լուսանկարները։`
            : 'Հավելվածի բոլոր ֆունկցիաներից օգտվելու համար (ֆիրմաները ձեզ կտեսնեն և կհրավիրեն) անհրաժեշտ է վարորդական իրավունք և անձնագիր։'}
      </Text>
      {!pending ? <Button label="Անցնել նույնականացում" onPress={() => router.push('/verify')} /> : null}
    </View>
  );
}
