// Խանութի գլխավոր էջը. որոնում → 4 մեծ կոճակ → իմ մատակարարները → առաջարկվողները → զամբյուղ (եթե լիքն է)
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ChatButton, PlatformLink } from '@/components/chat-button';
import { InviteButton } from '@/components/invite-button';
import { colorFor } from '@/lib/mappers';
import { deliveryLabel, formatAmd } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Logo, Screen, styles, Title } from '@/lib/ui';

type Ext = { id: string; name: string; category: string | null; channel: string };
const channelName: Record<string, string> = { whatsapp: 'WhatsApp', viber: 'Viber', sms: 'SMS' };

function Tile({ icon, title, sub, badge, dark, onPress }: { icon: string; title: string; sub?: string; badge?: number; dark?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width: '48%', flexGrow: 1, minHeight: 100, justifyContent: 'space-between', gap: 6, opacity: pressed ? 0.85 : 1 },
        dark ? { backgroundColor: colors.dark, borderColor: colors.dark } : null,
      ]}>
      <Text style={{ fontSize: 22, color: '#2E9E5B' }}>{icon}</Text>
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.strong, { flexShrink: 1, fontSize: 15 }, dark ? { color: '#FFFFFF' } : null]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
          {badge ? (
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {sub ? (
          <Text style={[styles.muted, dark ? { color: colors.onDarkMuted } : null]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ShopHome() {
  const { session, shops, links, firms, employees, cart, orders, debts, deliveryDate } = useStore();
  const [ext, setExt] = useState<Ext[]>([]);
  const [liveNew, setLiveNew] = useState(0);
  // Հավելվածից դուրս մատակարարներ և Live շուկայի թարմ առաջարկներ՝ ամեն անգամ էջ վերադառնալիս
  useFocusEffect(
    useCallback(() => {
      supabase.from('external_suppliers').select('id, name, category, channel').order('name').then(({ data }) => setExt((data ?? []) as Ext[]));
      supabase.rpc('live_deals').then(({ data }) =>
        setLiveNew(((data ?? []) as { created_at: string }[]).filter((d) => Date.now() - new Date(d.created_at).getTime() < 86400000).length),
      );
    }, []),
  );
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const shop = shops.find((s) => s.id === session.shopId);
  if (!shop) return <Redirect href="/" />;

  const myLinks = links.filter((l) => l.shopId === shop.id && l.status === 'active');
  const pending = links.filter((l) => l.shopId === shop.id && l.status === 'pending');
  const today = new Date().toISOString().slice(0, 10);
  const featured = firms.filter((f) => f.featuredUntil && f.featuredUntil >= today && !myLinks.some((l) => l.firmId === f.id));
  const cartCount = Object.keys(cart).length;
  const active = orders.filter((o) => o.shopId === shop.id && ['sent', 'accepted', 'preparing', 'on_the_way'].includes(o.status));
  const onTheWay = active.filter((o) => o.status === 'on_the_way').length;
  const debt = debts.filter((d) => d.shopId === shop.id).reduce((s, d) => s + d.debt, 0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.dark }}>Մատակարար</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <PlatformLink />
          <ChatButton />
          <InviteButton />
          <Pressable accessibilityRole="button" accessibilityLabel="Իմ տվյալները" onPress={() => router.push('/shop/profile')} hitSlop={12}>
            <Text style={{ fontSize: 20 }}>👤</Text>
          </Pressable>
        </View>
      </View>
      <Title sub={shop.name}>Բարի օր</Title>

      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: cartCount ? 90 : 24 }}>
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Որոնում"
          onPress={() => router.push('/shop/search')}
          style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderWidth: 1.5 }]}>
          <Text style={{ fontSize: 16 }}>🔍</Text>
          <Text style={[styles.muted, { fontSize: 15 }]} numberOfLines={1}>
            Ի՞նչ եք փնտրում (օր.՝ ձու, կաթ)
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Tile icon="📦" title="Պատվերներ" badge={active.length || undefined} sub={onTheWay ? `${onTheWay} ճանապարհին` : active.length ? 'ընթացքում' : 'բոլորը'} onPress={() => router.push('/shop/orders')} />
          <Tile icon="💳" title="Հաշիվներ" sub={debt > 0 ? `Պարտք՝ ${formatAmd(debt)}` : 'Պարտք չկա'} onPress={() => router.push('/shop/debts')} />
          <Tile icon="●" title="Live շուկա" sub={liveNew ? `${liveNew} նոր առաջարկ` : 'թարմ առաջարկներ'} onPress={() => router.push('/market')} />
          <Tile icon="🏪" title="Մատակարարներ" sub="Բոլորը · գտեք նորերին" dark onPress={() => router.push('/shop/suppliers')} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <Text style={[styles.strong, { fontSize: 14, color: colors.textMuted }]}>Իմ մատակարարները</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/shop/suppliers')} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Ավելացնել</Text>
          </Pressable>
        </View>
        {myLinks.length === 0 && pending.length === 0 && ext.length === 0 ? (
          <Text style={styles.muted}>Դեռ մատակարար չունեք. սեղմեք «Բոլոր մատակարարները» և միացեք</Text>
        ) : null}
        {myLinks.map((l) => {
          const f = firms.find((x) => x.id === l.firmId);
          if (!f) return null;
          const m = employees.find((e) => e.id === l.managerId);
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              onPress={() => router.push(`/shop/supplier/${f.id}`)}
              style={({ pressed }) => [styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.8 : 1 }]}>
              <Logo name={f.name} uri={f.logoUrl} bg={f.color.bg} fg={f.color.fg} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong} numberOfLines={1}>{f.name}</Text>
                <Text style={styles.muted} numberOfLines={1}>{[f.category, m?.name].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{deliveryLabel(deliveryDate(l))}</Text>
            </Pressable>
          );
        })}
        {pending.map((l) => (
          <View key={l.firmId} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }]}>
            <Text style={[styles.strong, { flex: 1 }]} numberOfLines={1}>{firms.find((f) => f.id === l.firmId)?.name}</Text>
            <Text style={styles.muted}>Հայտը սպասում է</Text>
          </View>
        ))}
        {ext.map((e) => {
          const c = colorFor(e.id);
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              onPress={() => router.push(`/shop/external?open=${e.id}`)}
              style={({ pressed }) => [
                styles.card,
                { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, backgroundColor: '#F0EEE8', borderStyle: 'dashed', opacity: pressed ? 0.8 : 1 },
              ]}>
              <Logo name={e.name} bg={c.bg} fg={c.fg} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong} numberOfLines={1}>
                  {e.name}
                  {e.category ? <Text style={{ fontWeight: '400', color: colors.textMuted }}> · {e.category}</Text> : null}
                </Text>
                <Text style={styles.muted}>Պատվեր {channelName[e.channel] ?? e.channel}-ով</Text>
              </View>
              <Text style={{ fontSize: 18, color: colors.textMuted }}>›</Text>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" onPress={() => router.push('/shop/external')} hitSlop={8}>
          <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 4 }}>+ Մատակարար, որը հավելվածում չէ (WhatsApp / Viber)</Text>
        </Pressable>

        {featured.length ? (
          <>
            <Text style={[styles.strong, { fontSize: 14, color: colors.textMuted, marginTop: 6 }]}>Առաջարկվող</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {featured.map((f) => (
                <Pressable key={f.id} accessibilityRole="button" onPress={() => router.push(`/shop/firm/${f.id}`)} style={[styles.card, { width: 150, gap: 6 }]}>
                  <Logo name={f.name} uri={f.logoUrl} bg={f.color.bg} fg={f.color.fg} size={36} />
                  <Text style={styles.strong} numberOfLines={1}>{f.name}</Text>
                  <Text style={styles.muted} numberOfLines={1}>{f.category}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}
      </ScrollView>

      {cartCount ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/shop/cart')}
          style={({ pressed }) => ({
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 20,
            minHeight: 56,
            borderRadius: radius.lg,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.9 : 1,
          })}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }} maxFontSizeMultiplier={1.3}>
            🛒 Զամբյուղ · {cartCount} ապրանք
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
