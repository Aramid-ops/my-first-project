// 💬 վերևի անկյունում՝ չկարդացված հաղորդագրությունների քանակով
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useConversations } from '@/lib/chat';
import { colors } from '@/lib/theme';
import { styles } from '@/lib/ui';

export function ChatButton() {
  const { unreadTotal } = useConversations();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Չաթ${unreadTotal ? `, ${unreadTotal} նոր` : ''}`} onPress={() => router.push('/chats')} hitSlop={12}>
      <Text style={[styles.muted, unreadTotal ? { color: colors.dark, fontWeight: '700' } : null]}>💬{unreadTotal ? ` ${unreadTotal}` : ''}</Text>
    </Pressable>
  );
}
