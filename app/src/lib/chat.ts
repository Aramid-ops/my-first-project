// Չաթ. զրույցներ, կոնտակտներ, հաղորդագրություններ (ակնթարթային)
import { useCallback, useEffect, useState } from 'react';

import { channelName, supabase } from './supabase';

export type Conversation = { id: string; title: string; lastText?: string; lastAt: string; unread: number };
export type Contact = { userId: string; name: string; subtitle: string };
export type Message = { id: number; sender: string; body?: string; photoUrl?: string; createdAt: string; readAt?: string };

async function myId() {
  return (await supabase.auth.getSession()).data.session?.user.id ?? '';
}

export function useConversations() {
  const [list, setList] = useState<Conversation[]>([]);
  const load = useCallback(async () => {
    const me = await myId();
    const [{ data: convs }, { data: unread }] = await Promise.all([
      supabase.from('conversations').select('*').order('last_at', { ascending: false }),
      supabase.from('messages').select('conversation_id').is('read_at', null).neq('sender', me),
    ]);
    const counts = new Map<string, number>();
    for (const u of unread ?? []) counts.set(u.conversation_id, (counts.get(u.conversation_id) ?? 0) + 1);
    setList(
      (convs ?? []).map((c) => ({
        id: c.id,
        title: (c.a === me ? c.b_name : c.a_name) ?? '',
        lastText: c.last_text ?? undefined,
        lastAt: c.last_at,
        unread: counts.get(c.id) ?? 0,
      })),
    );
  }, []);
  useEffect(() => {
    load();
    const ch = supabase.channel(channelName('chat-list')).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, load).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);
  return { list, reload: load, unreadTotal: list.reduce((s, c) => s + c.unread, 0) };
}

export async function loadContacts(): Promise<Contact[]> {
  const { data } = await supabase.rpc('my_contacts');
  const seen = new Set<string>();
  return ((data ?? []) as { user_id: string; name: string; subtitle: string }[])
    .filter((c) => !seen.has(c.user_id) && seen.add(c.user_id))
    .map((c) => ({ userId: c.user_id, name: c.name, subtitle: c.subtitle }));
}

export async function openChat(userId: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('open_chat', { other: userId });
  return error ? { error: error.message } : { id: data as string };
}

export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [me, setMe] = useState('');
  const [title, setTitle] = useState('');
  const load = useCallback(async () => {
    const uid = await myId();
    setMe(uid);
    const [{ data }, { data: conv }] = await Promise.all([
      supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at'),
      supabase.from('conversations').select('*').eq('id', conversationId).maybeSingle(),
    ]);
    if (conv) setTitle((conv.a === uid ? conv.b_name : conv.a_name) ?? '');
    setMessages(
      (data ?? []).map((m) => ({ id: m.id, sender: m.sender, body: m.body ?? undefined, photoUrl: m.photo_url ?? undefined, createdAt: m.created_at, readAt: m.read_at ?? undefined })),
    );
    // նշել որպես կարդացված
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('conversation_id', conversationId).is('read_at', null).neq('sender', uid);
  }, [conversationId]);
  useEffect(() => {
    load();
    const ch = supabase
      .channel(channelName(`chat-${conversationId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, load]);
  const send = async (body: string, photoUrl?: string) => {
    const { error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender: me, body: body || null, photo_url: photoUrl ?? null });
    if (!error) load();
    return error?.message ?? null;
  };
  return { messages, me, title, send };
}
