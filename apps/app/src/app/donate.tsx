import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { InfoPage } from '@/components/InfoPage';
import { useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { useSupportShown } from '@/features/support/useSupportShown';
import { donateApi } from '@/lib/communityApi';
import { webLink } from '@/lib/links';
import { Button, GlassView, Text, TextField, useAppTheme } from '@/ui';
import { track } from '@/lib/analytics';

const AMOUNTS = [5, 10, 25, 50];
const CURRENCIES = [
  { code: 'eur', symbol: '€' },
  { code: 'usd', symbol: '$' },
  { code: 'gbp', symbol: '£' },
] as const;

/**
 * "Support us": donations through Stripe Checkout on the web. Phones only
 * explain how to support ChessMate, with a Learn more link to the web page,
 * so the app stores' payment rules are kept. Staff can hide the whole entry
 * from Admin → Payments without a new build.
 */
export default function Donate() {
  const tr = useT();
  const c = useAppTheme().colors;
  const { donated } = useLocalSearchParams<{ donated?: string }>();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const shown = useSupportShown();
  const [amount, setAmount] = useState(10);
  /** A typed amount wins over the buttons while it holds a number. */
  const [custom, setCustom] = useState('');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]['code']>('eur');
  const [range, setRange] = useState({ min: 2, max: 500 });
  const symbol = CURRENCIES.find((x) => x.code === currency)!.symbol;
  const typed = Number(custom.replace(',', '.'));
  const chosen = custom.trim() && Number.isFinite(typed) ? Math.round(typed * 100) / 100 : amount;
  const valid = chosen >= range.min && chosen <= range.max;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const web = Platform.OS === 'web';
  const webPage = webLink('/donate');

  useEffect(() => {
    donateApi.info().then(
      (r) => {
        setEnabled(r.enabled);
        setRange({ min: r.min / 100, max: r.max / 100 });
      },
      () => setEnabled(false),
    );
  }, []);

  const pay = async () => {
    if (!webPage) return;
    track('donate_start', { amount: chosen });
    setBusy(true);
    try {
      const r = await donateApi.checkout(Math.round(chosen * 100), currency, webPage);
      if (typeof window !== 'undefined') window.location.href = r.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <InfoPage
      title="pages.donate.title"
      intro="pages.donate.intro"
      sections={[
        ['pages.donate.whereTitle', 'pages.donate.where'],
        ['pages.donate.freeTitle', 'pages.donate.free'],
      ]}>
      <GlassView radius="xl" padding="lg" style={{ gap: 14 }}>
        {!shown ? (
          <Text tone="muted">{tr('pages.donate.hidden')}</Text>
        ) : donated === '1' ? (
          <View style={styles.thanks}>
            <Ionicons name="heart" size={22} color={c.danger} />
            <Text variant="heading" style={{ flex: 1 }}>
              {tr('pages.donate.thanks')}
            </Text>
          </View>
        ) : !web ? (
          <>
            <Text variant="heading">{tr('pages.donate.howTitle')}</Text>
            <Text tone="muted">{tr('pages.donate.how')}</Text>
            {webPage ? (
              <Button variant="secondary" title={tr('pages.donate.learnMore')} onPress={() => void Linking.openURL(webPage)} rightIcon={<Ionicons name="open-outline" size={16} color={c.text} />} />
            ) : null}
          </>
        ) : enabled === false ? (
          <Text tone="muted">{tr('pages.donate.soon')}</Text>
        ) : (
          <>
            <View style={styles.amounts} accessibilityRole="radiogroup" accessibilityLabel={tr('pages.donate.currency')}>
              {CURRENCIES.map((x) => {
                const on = x.code === currency;
                return (
                  <Pressable
                    key={x.code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setCurrency(x.code)}
                    style={[styles.currency, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : 'transparent' }]}>
                    <Text variant="caption" color={on ? c.onAccent : c.text}>
                      {`${x.symbol} ${x.code.toUpperCase()}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.amounts}>
              {AMOUNTS.map((a) => {
                const on = !custom.trim() && a === amount;
                return (
                  <Pressable
                    key={a}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setAmount(a);
                      setCustom('');
                    }}
                    style={[styles.amount, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.surface }]}>
                    <Text variant="figure" color={on ? c.onAccent : c.text} style={{ fontSize: 22 }}>
                      {`${symbol}${a}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextField
              label={tr('pages.donate.customAmount')}
              value={custom}
              onChangeText={(v) => setCustom(v.replace(/[^\d.,]/g, '').slice(0, 7))}
              keyboardType="decimal-pad"
              placeholder={`${symbol}${range.min} – ${symbol}${range.max}`}
            />
            <Button
              title={tr('pages.donate.give', { amount: `${symbol}${chosen}` })}
              onPress={pay}
              loading={busy}
              disabled={enabled === null || !valid}
              leftIcon={<Ionicons name="heart" size={16} color={c.onAccent} />}
            />
            <Text variant="caption" tone="tertiary">
              {tr('pages.donate.secure')}
            </Text>
          </>
        )}
        {error && (
          <Text variant="caption" tone="danger">
            {serverText(error)}
          </Text>
        )}
      </GlassView>
    </InfoPage>
  );
}

const styles = StyleSheet.create({
  amounts: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  amount: { flexGrow: 1, flexBasis: 70, alignItems: 'center', paddingVertical: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  thanks: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  currency: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
});
