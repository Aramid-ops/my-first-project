// Բացման էկրան. բորդո ֆոն, սպիտակ նշան, «Մատակարար» և բեռնման նշան
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text } from 'react-native';

import { colors } from '@/lib/theme';

export function BrandSplash({ visible = true }: { visible?: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 350, useNativeDriver: true }).start();
  }, [visible, opacity]);
  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, s.wrap, { opacity }]}>
      <Image source={require('../../assets/images/splash-icon.png')} style={s.logo} contentFit="contain" accessibilityLabel="Մատակարար" />
      <Text style={s.name}>Մատակարար</Text>
      <ActivityIndicator color="#FFFFFF" style={{ marginTop: 28 }} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  logo: { width: 96, height: 96 },
  name: { color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginTop: 18, letterSpacing: 0.3 },
});
