// Զրույցներ + «Նոր զրույց» (միայն նրանց հետ, ում հետ կապ ունեմ)
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { loadContacts, openChat, useConversations, type Contact } from '@/lib/chat';
import { formatTime } from '@/lib/rules';
import { matches } from '@/lib/search';
import { colors } from '@/lib/theme';
import { Chips, Field, Screen, styles, Title } from '@/lib/ui';

export default function Chats() {
  const { list } = useConversations();
  const [tab, setTab] = useState<'chats' | 'new'>('chats');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (tab === 'new') loadContacts().then(setContacts);
  }, [tab]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title>Չաթ</Title>
      </View>
      <View style={{ marginBottom: 12 }}>
        <Chips options={[{ value: 'chats', label: 'Զրույցներ' }, { value: 'new', label: '+ Նոր զրույց' }]} value={tab} onChange={setTab} />
      </View>
      {err ? <Text style={{ color: colors.warnText, marginBottom: 8 }}>{err}</Text> : null}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
        {tab === 'chats' ? (
          list.length === 0 ? (
            <Text style={styles.muted}>Դեռ զրույց չկա. սեղմեք «+ Նոր զրույց»</Text>
          ) : (
            list.map((c) => (
              <Pressable key={c.id} accessibilityRole="button" onPress={() => router.push(`/chat/${c.id}`)} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.strong} numberOfLines={1}>{c.title}</Text>
                  <Text style={styles.muted} numberOfLines={1}>{c.lastText ?? ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.muted}>{formatTime(c.lastAt)}</Text>
                  {c.unread ? (
                    <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{c.unread}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ))
          )
        ) : (
          <>
            <Field label="Փնտրել" value={q} onChangeText={setQ} />
            {contacts
              .filter((c) => matches(`${c.name} ${c.subtitle}`, q))
              .map((c) => (
                <Pressable
                  key={c.userId}
                  accessibilityRole="button"
                  onPress={async () => {
                    const r = await openChat(c.userId);
                    if (r.id) router.push(`/chat/${r.id}`);
                    else setErr(r.error ?? null);
                  }}
                  style={[styles.card, { gap: 2 }]}>
                  <Text style={styles.strong}>{c.name}</Text>
                  <Text style={styles.muted}>{c.subtitle}</Text>
                </Pressable>
              ))}
            {contacts.length === 0 ? <Text style={styles.muted}>Դեռ կոնտակտ չկա. նրանք կհայտնվեն, երբ աշխատեք մատակարարների / խանութների / գործընկերների հետ</Text> : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
