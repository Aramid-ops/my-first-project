// Մենեջերի «Գծեր, առաքման օրեր և վերջնաժամ». իր խանութների գծերը, իսկ եթե ֆիրման ղեկավար չունի՝ բոլորը
import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { LinesEditor, LinesExplainer } from '@/components/lines-editor';
import { firmHasAdmin } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { Screen, Title } from '@/lib/ui';

export default function ManagerLines() {
  const { session, employees, links, lines, firms } = useStore();
  const me = session?.kind === 'employee' ? employees.find((e) => e.id === session.employeeId) : undefined;
  if (!me) return <Redirect href="/" />;
  const hasAdmin = firmHasAdmin(employees, firms.find((f) => f.id === me.firmId));
  const mine = lines.filter((l) => l.firmId === me.firmId && (!hasAdmin || links.some((x) => x.lineId === l.id && x.managerId === me.id)));
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Հետ" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Title>Գծեր և վերջնաժամ</Title>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 32 }}>
        <LinesExplainer />
        {hasAdmin && mine.length === 0 ? <Text>Ձեր խանութները դեռ գծի վրա չեն։ Գիծը ընտրեք խանութի «⚙️ Քարտ»-ում։</Text> : null}
        <LinesEditor lines={mine} firmId={me.firmId} canCreate={!hasAdmin} />
      </ScrollView>
    </Screen>
  );
}
