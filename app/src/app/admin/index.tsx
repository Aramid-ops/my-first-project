// Ղեկավար. կարգավորում է գծերը (վարորդ), խմբերը (անդամներ) և խանութները (մենեջեր, գիծ)։
// Պարզության կանոն. սա մեկ անգամ կարգավորվող էջ է, սովորական աշխատողը այն չի տեսնում։
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Chips, Screen, styles, Title } from '@/lib/ui';

const dayShort = ['', 'երկ', 'երք', 'չրք', 'հնգ', 'ուրբ', 'շբթ', 'կիր'];

export default function Admin() {
  const { session, employees, firms, shops, links, lines, teams, setLineDriver, toggleTeamMember, setLinkManager, setLinkLine, signOut } = useStore();
  const [tab, setTab] = useState<'lines' | 'teams' | 'shops'>('lines');
  const [error, setError] = useState<string | null>(null);
  if (session?.kind !== 'employee') return <Redirect href="/" />;
  const me = employees.find((e) => e.id === session.employeeId)!;
  const firm = firms.find((f) => f.id === me.firmId)!;
  const staff = employees.filter((e) => e.firmId === me.firmId && e.id !== me.id);
  const drivers = staff.filter((e) => e.role === 'driver');
  const managers = staff.filter((e) => e.role === 'manager');
  const firmLines = lines.filter((l) => l.firmId === me.firmId);
  const firmTeams = teams.filter((t) => t.firmId === me.firmId);
  const firmLinks = links.filter((l) => l.firmId === me.firmId);
  const run = async (p: Promise<string | null>) => setError(await p);
  const roleName = (r: string, d?: string) => d ?? ({ manager: 'մենեջեր', driver: 'վարորդ', staff: 'աշխատող', admin: 'ղեկավար' } as Record<string, string>)[r];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.dark }}>Մատակարար</Text>
        <Pressable accessibilityRole="button" onPress={() => { signOut(); router.replace('/'); }} hitSlop={12}>
          <Text style={styles.muted}>Դուրս գալ</Text>
        </Pressable>
      </View>
      <Title sub={`${firm.name} · ղեկավար`}>Կարգավորումներ</Title>

      <View style={{ marginBottom: 12 }}>
        <Chips
          options={[
            { value: 'lines', label: 'Գծեր' },
            { value: 'teams', label: 'Խմբեր' },
            { value: 'shops', label: 'Խանութներ' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {error ? <Text style={{ color: colors.warnText, marginBottom: 8 }}>{error}</Text> : null}

      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {tab === 'lines'
          ? firmLines.map((l) => (
              <View key={l.id} style={[styles.card, { gap: 8 }]}>
                <Text style={styles.strong}>{l.name}</Text>
                <Text style={styles.muted}>
                  {l.deliveryDays.length ? l.deliveryDays.map((d) => dayShort[d]).join(', ') : 'ամեն օր'}
                  {l.teamId ? ` · ${firmTeams.find((t) => t.id === l.teamId)?.name ?? ''}` : ''}
                  {` · ${firmLinks.filter((x) => x.lineId === l.id).length} խանութ`}
                </Text>
                <Text style={styles.muted}>Վարորդ՝</Text>
                <Chips options={drivers.map((d) => ({ value: d.id, label: d.name }))} value={l.driverId ?? null} onChange={(v) => run(setLineDriver(l.id, v))} />
              </View>
            ))
          : null}

        {tab === 'teams'
          ? firmTeams.map((t) => (
              <View key={t.id} style={[styles.card, { gap: 8 }]}>
                <Text style={styles.strong}>{t.name}</Text>
                <Text style={styles.muted}>Սեղմեք՝ ավելացնելու կամ հանելու համար</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {staff.map((e) => {
                    const on = t.memberIds.includes(e.id);
                    return (
                      <Pressable
                        key={e.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        onPress={() => run(toggleTeamMember(t.id, e.id))}
                        style={{
                          minHeight: 40,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          justifyContent: 'center',
                          backgroundColor: on ? colors.primary : colors.card,
                          borderWidth: 1,
                          borderColor: on ? colors.primary : colors.borderStrong,
                        }}>
                        <Text style={{ color: on ? '#FFFFFF' : colors.text }}>
                          {on ? '✓ ' : ''}
                          {e.name} · {roleName(e.role, e.department)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          : null}

        {tab === 'shops'
          ? firmLinks.map((l) => {
              const shop = shops.find((s) => s.id === l.shopId);
              return (
                <View key={l.shopId} style={[styles.card, { gap: 8 }]}>
                  <Text style={styles.strong}>{shop?.name}</Text>
                  <Text style={styles.muted}>{[shop?.district, shop?.address].filter(Boolean).join(' · ')}</Text>
                  <Text style={styles.muted}>Մենեջեր՝</Text>
                  <Chips options={managers.map((m) => ({ value: m.id, label: m.name }))} value={l.managerId} onChange={(v) => run(setLinkManager(l.shopId, l.firmId, v))} />
                  <Text style={styles.muted}>Գիծ՝</Text>
                  <Chips
                    options={firmLines.map((x) => ({ value: x.id, label: x.name }))}
                    value={l.lineId ?? null}
                    onChange={(v) => run(setLinkLine(l.shopId, l.firmId, v))}
                  />
                </View>
              );
            })
          : null}
      </ScrollView>
    </Screen>
  );
}
