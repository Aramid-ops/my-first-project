// «Փոխանցել» — ընտրություն իմ խմբի մարդկանցից; գծի վարորդը / լռելյայնը՝ առաջինը (⭐)
import { Text, View } from 'react-native';

import { useStore } from '@/lib/store';
import type { Order } from '@/lib/types';
import { Button, styles } from '@/lib/ui';

const roleLabel = (role: string, department?: string) => department ?? (role === 'driver' ? 'վարորդ' : 'աշխատող');

export function ForwardPicker({ order }: { order: Order }) {
  const { forwardCandidates, forward } = useStore();
  const list = forwardCandidates(order);
  if (list.length === 0) return <Text style={styles.muted}>Ձեր խմբում փոխանցելու մարդ չկա. դիմեք ղեկավարին</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.muted}>Փոխանցել՝</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {list.map(({ employee: e, suggested }) => (
          <Button
            key={e.id}
            kind={suggested ? 'primary' : 'outline'}
            label={`${suggested ? '⭐ ' : ''}${e.name} (${roleLabel(e.role, e.department)})`}
            onPress={() => forward(order.id, e.id)}
            style={{ flexGrow: 1 }}
          />
        ))}
      </View>
    </View>
  );
}
