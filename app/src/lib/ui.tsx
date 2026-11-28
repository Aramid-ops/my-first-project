// Փոքր, կրկնվող UI մասեր
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, touch } from './theme';
import { isValidPhone } from './rules';

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
export function Logo({ name, bg, fg, size = 52, uri }: { name: string; bg: string; fg: string; size?: number; uri?: string }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size * 0.28 }} contentFit="cover" accessibilityLabel={name} />;
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
      <Text numberOfLines={Platform.OS === 'web' ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.3} style={{ color: fg, fontSize: 15, fontWeight: '700', paddingHorizontal: 4 }}>
        {label}
      </Text>
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
    paddingHorizontal: 10,
  },
  muted: { fontSize: 13, color: colors.textMuted },
  body: { fontSize: 15, color: colors.text },
  strong: { fontSize: 16, fontWeight: '600', color: colors.text },
});

/** Ընտրության կոճակներ (մեկ ընտրված) */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; hint?: string }[];
  value?: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{
              minHeight: 40,
              paddingHorizontal: 12,
              borderRadius: 999,
              justifyContent: 'center',
              backgroundColor: on ? colors.dark : colors.card,
              borderWidth: 1,
              borderColor: on ? colors.dark : colors.borderStrong,
            }}>
            <Text style={{ color: on ? '#FFFFFF' : colors.text, fontSize: 14, fontWeight: on ? '700' : '400' }}>
              {o.label}
              {o.hint ? <Text style={{ color: on ? colors.onDarkMuted : colors.textMuted, fontSize: 12 }}> · {o.hint}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Դաշտ՝ վերնագրով */
export function Field({
  label,
  value,
  onChangeText,
  secure,
  keyboardType,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  placeholder?: string;
  /** Հեռախոսի ավտոլրացում. լռելյայն՝ միայն էլ. փոստ, գաղտնաբառ, հեռախոս, մնացածը՝ անջատված */
  autoComplete?: TextInputProps['autoComplete'];
}) {
  const [hidden, setHidden] = useState(true);
  const [touched, setTouched] = useState(false);
  const phone = keyboardType === 'phone-pad';
  const phoneBad = phone && touched && value.replace(/\D/g, '').length > 3 && !isValidPhone(value);
  const auto = autoComplete ?? (keyboardType === 'email-address' ? 'email' : secure ? 'password' : keyboardType === 'phone-pad' ? 'tel' : 'off');
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.muted}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.card }}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secure && hidden}
          keyboardType={keyboardType}
          placeholder={placeholder ?? (phone ? '+374 77 123456' : undefined)}
          placeholderTextColor={colors.textMuted}
          // հեռախոսի դաշտում +374-ը գրվում է ինքնաբերաբար
          onFocus={() => phone && !value && onChangeText('+374 ')}
          onBlur={() => setTouched(true)}
          autoComplete={auto}
          importantForAutofill={auto === 'off' ? 'no' : 'auto'}
          autoCapitalize={keyboardType === 'email-address' || secure ? 'none' : 'sentences'}
          autoCorrect={false}
          style={{ flex: 1, minHeight: 48, paddingHorizontal: 14, fontSize: 16, color: colors.text }}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Ցույց տալ գաղտնաբառը' : 'Թաքցնել գաղտնաբառը'}
            onPress={() => setHidden(!hidden)}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>{hidden ? '👁' : '🙈'}</Text>
          </Pressable>
        ) : null}
      </View>
      {phoneBad ? <Text style={{ color: colors.warnText, fontSize: 13 }}>Համարը սխալ է։ Օրինակ՝ +374 77 123456</Text> : null}
    </View>
  );
}

/** Տող՝ պատճենելու կոճակով (📋) */
export function CopyRow({ label, value }: { label: string; value?: string | null }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={[styles.muted, { width: 96 }]}>{label}</Text>
      <Text style={[styles.body, { flex: 1 }]} selectable>
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Պատճենել ${label}`}
        onPress={async () => {
          await Clipboard.setStringAsync(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Text>{done ? '✓' : '📋'}</Text>
      </Pressable>
    </View>
  );
}

/** Մի քանի ընտրությամբ կոճակներ (օր.՝ կատեգորիաներ, թաղամասեր) */
export function MultiChips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <Pressable
            key={o}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o}
            onPress={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? colors.dark : colors.card, borderWidth: 1, borderColor: on ? colors.dark : colors.borderStrong }}>
            <Text style={{ color: on ? '#FFFFFF' : colors.text }}>{on ? '✓ ' : ''}{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
