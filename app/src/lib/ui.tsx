// Փոքր, կրկնվող UI մասեր
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, touch } from './theme';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.inner}>{children}</View>
    </SafeAreaView>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <View style={{ gap: 2, marginBottom: 12 }}>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      <Text style={styles.title}>{children}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Լոգո կամ գունավոր տառ */
export function Logo({ name, bg, fg, size = 52 }: { name: string; bg: string; fg: string; size?: number }) {
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: bg }]}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: size * 0.4 }}>{name.slice(0, 1)}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'dark' | 'outline';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? colors.primary : kind === 'dark' ? colors.dark : colors.card;
  const fg = kind === 'outline' ? colors.text : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        kind === 'outline' && { borderWidth: 1, borderColor: colors.borderStrong },
        style,
      ]}>
      <Text style={{ color: fg, fontSize: 15, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ text, tone = 'ok' }: { text: string; tone?: 'ok' | 'warn' | 'info' }) {
  const map = {
    ok: [colors.primarySoft, colors.primary],
    warn: [colors.warnBg, colors.warnText],
    info: [colors.infoBg, colors.infoText],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
  },
  logo: { alignItems: 'center', justifyContent: 'center' },
  button: {
    minHeight: touch + 8,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  muted: { fontSize: 13, color: colors.textMuted },
  body: { fontSize: 15, color: colors.text },
  strong: { fontSize: 16, fontWeight: '600', color: colors.text },
});
