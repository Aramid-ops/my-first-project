// Ֆիրմայի ակտիվացում բանկային փոխանցմամբ. ղեկավարը ֆիրմայի հաշվից փոխանցում է գումարը կոդով,
// մենք ստուգում ենք քաղվածքը (կոդ + ուղարկողի ՀՎՀՀ) և ակտիվացնում (🛡 հարթակ)
import { useState } from 'react';
import { Text } from 'react-native';

import { company } from '@/lib/company';
import { formatAmd } from '@/lib/rules';
import { useStore } from '@/lib/store';
import { colors } from '@/lib/theme';
import { Button, Card, CopyRow, styles } from '@/lib/ui';

export function ActivationCard({ code, paidAt, onPaid }: { code?: string; paidAt?: string | null; onPaid?: () => void }) {
  const { markVerificationPaid } = useStore();
  const [msg, setMsg] = useState<string | null>(null);
  const ready = !!company.account;
  return (
    <Card style={{ gap: 10 }}>
      <Text style={[styles.strong, { fontSize: 18 }]}>🏦 Ակտիվացրեք ֆիրման</Text>
      <Text style={styles.body}>
        Որ համոզվենք, որ ֆիրման իսկապես ձերն է, <Text style={{ fontWeight: '700' }}>ֆիրմայի բանկային հաշվից</Text> փոխանցեք {formatAmd(company.fee)} մեր հաշվին՝ նպատակում նշելով կոդը։
        Ստուգելուց հետո (1–2 աշխատանքային օր) բոլոր գործիքները կբացվեն։
      </Text>
      <CopyRow label="Կոդ (նպատակ)" value={code ?? '—'} />
      {ready ? (
        <>
          <CopyRow label="Ստացող" value={company.name} />
          <CopyRow label="Բանկ" value={company.bank} />
          <CopyRow label="Հաշիվ" value={company.account} />
        </>
      ) : (
        <Text style={{ color: colors.warnText }}>Մեր բանկային հաշվի տվյալները շուտով կավելացվեն։</Text>
      )}
      {paidAt ? (
        <Text style={{ color: colors.primary, fontWeight: '600' }}>⏳ Նշել եք, որ վճարել եք։ Ստուգում ենք (1–2 օր), կստանաք ծանուցում։</Text>
      ) : (
        <Button
          label="Վճարել եմ ✓"
          disabled={!ready}
          onPress={async () => {
            const err = await markVerificationPaid();
            setMsg(err);
            if (!err) onPaid?.();
          }}
        />
      )}
      {msg ? <Text style={{ color: colors.warnText }}>{msg}</Text> : null}
    </Card>
  );
}
