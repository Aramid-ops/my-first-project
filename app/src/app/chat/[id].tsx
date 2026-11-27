// Զրույց. տեքստ + լուսանկար, ակնթարթային, ✓✓ կարդացված
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useMessages } from '@/lib/chat';
import { pickAndUpload } from '@/lib/media';
import { formatTime } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors, radius } from '@/lib/theme';
import { Screen, styles } from '@/lib/ui';

export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { messages, me, title, send } = useMessages(id);
  const { session, employees } = useStore();
  const [text, setText] = useState('');
  const scroll = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);
  // լուսանկարի պանակ՝ ըստ դերի (թույլտվությունները՝ բազայում)
  const folder =
    session?.kind === 'shop' ? `shop/${session.shopId}` : session?.kind === 'employee' ? `firm/${employees.find((e) => e.id === session.employeeId)?.firmId}` : null;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Text style={[styles.strong, { flex: 1, fontSize: 17 }]} numberOfLines={1}>{title}</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll as never} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
          {messages.map((m) => {
            const mine = m.sender === me;
            return (
              <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', backgroundColor: mine ? colors.dark : colors.card, borderRadius: 16, padding: 10, borderWidth: mine ? 0 : 1, borderColor: colors.border, gap: 4 }}>
                {m.photoUrl ? <Image source={{ uri: m.photoUrl }} style={{ width: 200, height: 150, borderRadius: 10 }} contentFit="cover" accessibilityLabel="Լուսանկար" /> : null}
                {m.body ? <Text style={{ color: mine ? '#FFFFFF' : colors.text, fontSize: 15 }}>{m.body}</Text> : null}
                <Text style={{ color: mine ? colors.onDarkMuted : colors.textMuted, fontSize: 11, alignSelf: 'flex-end' }}>
                  {formatTime(m.createdAt)}
                  {mine ? (m.readAt ? ' ✓✓' : ' ✓') : ''}
                </Text>
              </View>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingVertical: 10 }}>
          {folder ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Կցել լուսանկար"
              onPress={async () => {
                const r = await pickAndUpload(folder);
                if (r.url) send('', r.url);
              }}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong }}>
              <Text>📷</Text>
            </Pressable>
          ) : null}
          <TextInput importantForAutofill="no"
            accessibilityLabel="Հաղորդագրություն"
            placeholder="Գրեք կամ թելադրեք 🎤…"
            value={text}
            onChangeText={setText}
            multiline
            style={{ flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, backgroundColor: colors.card, color: colors.text }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ուղարկել"
            disabled={!text.trim()}
            onPress={async () => {
              const t = text.trim();
              setText('');
              await send(t);
            }}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim() ? colors.primary : colors.borderStrong }}>
            <Text style={{ color: '#FFFFFF', fontSize: 18 }}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
