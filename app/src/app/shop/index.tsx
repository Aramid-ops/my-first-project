import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { colorFor } from '@/lib/mappers';
import { supabase } from '@/lib/supabase';

import { deliveryLabel } from '@/lib/rules';
import { ChatButton, PlatformLink } from '@/components/chat-button';
import { InviteButton } from '@/components/invite-button';
import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Button, Logo, Screen, styles, Title } from '@/lib/ui';

export default function ShopHome() {
  const { session, shops, links, firms, employees, cart, orders, signOut, deliveryDate, savedLists, applyList } = useStore();
  // Հավելվածից դուրս մատակարարները (WhatsApp / Viber / SMS) նույնպես «Իմ մատակարարները»-ում են
  const [ext, setExt] = useState<{ id: string; name: string; category: string | null; channel: string }[]>([]);
  useFocusEffect(
    useCallback(() => {
      supabase.from('external_suppliers').select('id, name, category, channel').order('name').then(({ data }) => setExt(data ?? []));
    }, []),
  );
  if (session?.kind !== 'shop') return <Redirect href="/" />;
  const shop = shops.find((s) => s.id === session.shopId)!;
  if (!shop) return <Redirect href="/" />;
  const myLinks = links.filter((l) => l.shopId === shop.id && l.status === 'active');
  const pending = links.filter((l) => l.shopId === shop.id && l.status === 'pending');
  // Վճարող («առաքարկվող») մատակարարները միշտ երևում են վերևում
  const today = new Date().toISOString().slice(0, 10);
  const featured = firms.filter((f) => f.featuredUntil && f.featuredUntil >= today);
  const cartCount = Object.keys(cart).length;
  const myOrders = orders.filter((o) => o.shopId === shop.id).length;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.dark }}>Մատակարար</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Իմ տվյալները" onPress={() => router.push('/shop/profile')} hitSlop={12}>
            <Text style={{ fontSize: 18 }}>👤</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <PlatformLink />
          <ChatButton />
          <InviteButton />
            <Pressable accessibilityRole="button" onPress={() => { signOut(); router.replace('/'); }} hitSlop={12}>
            <Text style={styles.muted}>Դուրս գալ</Text>
          </Pressable>
          </View>
        </View>
      </View>
      <Title sub={shop.name}>Բարի օր</Title>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Որոնում"
        onPress={() => router.push('/shop/search')}
        style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, marginBottom: 12 }]}>
        <Text style={{ fontSize: 16 }}>🔍</Text>
        <Text style={styles.muted}>Ապրանք, մատակարար կամ արտիկուլ</Text>
      </Pressable>

      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {featured.length ? <Text style={[styles.strong, { fontSize: 14, color: colors.textMuted }]}>Առաջարկվող մատակարարներ</Text> : null}
        {featured.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {featured.map((f) => {
              const st = links.find((l) => l.shopId === shop.id && l.firmId === f.id)?.status;
              return (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  onPress={() => router.push(st === 'active' ? `/shop/supplier/${f.id}` : `/shop/firm/${f.id}`)}
                  style={[styles.card, { width: '47%', flexGrow: 1, alignItems: 'flex-start', gap: 8 }]}>
                  <Logo name={f.name} uri={f.logoUrl} bg={f.color.bg} fg={f.color.fg} size={48} />
                  <Text style={styles.strong}>{f.name}</Text>
                  <Text style={styles.muted}>{f.category}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: st === 'active' ? colors.primary : colors.infoText }}>
                    {st === 'active' ? 'Պատվիրել →' : st === 'pending' ? 'Հայտը ուղարկված է' : 'Դիտել →'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {savedLists.length ? <Text style={[styles.strong, { fontSize: 14, color: colors.textMuted }]}>Իմ ցուցակները</Text> : null}
        {savedLists.map((l) => (
          <Pressable
            key={l.id}
            accessibilityRole="button"
            onPress={() => { applyList(l); router.push('/shop/cart'); }}
            style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <Text style={[styles.strong, { flex: 1 }]}>📋 {l.name}</Text>
            <Text style={styles.muted}>{l.items.length} ապրանք · Զամբյուղ →</Text>
          </Pressable>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/shop/suppliers')}
          style={({ pressed }) => [styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.dark, borderColor: colors.dark, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={{ fontSize: 22 }}>🏪</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>Բոլոր մատակարարները</Text>
            <Text style={{ color: colors.onDarkMuted }}>{firms.length} մատակարար · գտեք նորերին և միացեք</Text>
          </View>
          <Text style={{ fontSize: 20, color: '#FFFFFF' }}>›</Text>
        </Pressable>

        {myLinks.length || ext.length ? <Text style={[styles.strong, { fontSize: 14, color: colors.textMuted }]}>Իմ մատակարարները</Text> : null}
        {myLinks.length === 0 && pending.length === 0 && ext.length === 0 ? (
          <Text style={styles.muted}>Գտեք մատակարարին որոնումով և սեղմեք «Միանալ»</Text>
        ) : null}
        {pending.map((l) => (
          <View key={l.firmId} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <Text style={[styles.strong, { flex: 1 }]}>{firms.find((f) => f.id === l.firmId)?.name}</Text>
            <Text style={styles.muted}>Հայտը սպասում է</Text>
          </View>
        ))}
        {myLinks.map((l) => {
          const f = firms.find((x) => x.id === l.firmId)!;
          const m = employees.find((e) => e.id === l.managerId);
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              onPress={() => router.push(`/shop/supplier/${f.id}`)}
              style={({ pressed }) => [styles.card, { flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.8 : 1 }]}>
              <Logo name={f.name} uri={f.logoUrl} bg={f.color.bg} fg={f.color.fg} size={56} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.strong}>{f.name}</Text>
                {m ? <Text style={styles.muted}>Մենեջեր՝ {m.name}</Text> : null}
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                  Առաքում՝ {deliveryLabel(deliveryDate(l))}
                </Text>
              </View>
              <Text style={{ fontSize: 20, color: colors.textMuted }}>›</Text>
            </Pressable>
          );
        })}
        {ext.map((e) => {
          const c = colorFor(e.id);
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              onPress={() => router.push(`/shop/external?open=${e.id}`)}
              style={({ pressed }) => [styles.card, { flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.8 : 1 }]}>
              <Logo name={e.name} bg={c.bg} fg={c.fg} size={56} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.strong}>
                  {e.name}
                  {e.category ? <Text style={{ fontWeight: '400', color: colors.textMuted }}> · {e.category}</Text> : null}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.infoText }}>
                  Պատվեր՝ {e.channel === 'whatsapp' ? 'WhatsApp' : e.channel === 'viber' ? 'Viber' : 'SMS'}-ով
                </Text>
              </View>
              <Text style={{ fontSize: 20, color: colors.textMuted }}>›</Text>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" onPress={() => router.push('/shop/external')} style={{ paddingVertical: 10 }}>
          <Text style={{ color: colors.primary, fontWeight: '600', textAlign: 'center' }}>+ Ավելացնել մատակարար, որը հավելվածում չէ (WhatsApp / Viber / SMS)</Text>
        </Pressable>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 20 }}>
        <Button kind="outline" label={`Պատվերներ${myOrders ? ` · ${myOrders}` : ''}`} onPress={() => router.push('/shop/orders')} style={{ flex: 1 }} />
        <Button kind="outline" label="Հաշիվներ" onPress={() => router.push('/shop/debts')} style={{ flex: 1 }} />
        <Button kind="dark" label={`Զամբյուղ${cartCount ? ` · ${cartCount}` : ''}`} onPress={() => router.push('/shop/cart')} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}
