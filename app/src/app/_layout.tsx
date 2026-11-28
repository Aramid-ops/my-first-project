import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BrandSplash } from '@/components/brand-splash';
import { StoreProvider, useStore } from '@/lib/store';
import { colors } from '@/lib/theme';

/** Բացելիս բրենդի էկրանը մնում է առնվազն 1.2 վրկ կամ մինչև տվյալները բեռնվեն */
function App() {
  const { ready } = useStore();
  const [minDone, setMinDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), 1200);
    return () => clearTimeout(t);
  }, []);
  const splash = !ready || !minDone;
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={splash ? 'light' : 'dark'} />
      {/* Էջերը՝ միայն տվյալները բեռնվելուց հետո, որ ուղիղ հղումով (կամ թարմացնելիս) չվերադառնան գլխավոր էջ */}
      {ready ? <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} /> : null}
      <BrandSplash visible={splash} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
