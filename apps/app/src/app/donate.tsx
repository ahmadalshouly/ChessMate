import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { InfoPage } from '@/components/InfoPage';
import { useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { donateApi } from '@/lib/communityApi';
import { webLink } from '@/lib/links';
import { Button, GlassView, Text, useAppTheme } from '@/ui';

const AMOUNTS = [5, 10, 25, 50];

/**
 * Donations through Stripe Checkout on the web. Phones open the web page to
 * donate (like paid tournament entries), so the app stores' payment rules are kept.
 */
export default function Donate() {
  const tr = useT();
  const c = useAppTheme().colors;
  const { donated } = useLocalSearchParams<{ donated?: string }>();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const web = Platform.OS === 'web';
  const webPage = webLink('/donate');

  useEffect(() => {
    donateApi.info().then(
      (r) => setEnabled(r.enabled),
      () => setEnabled(false),
    );
  }, []);

  const pay = async () => {
    if (!webPage) return;
    setBusy(true);
    try {
      const r = await donateApi.checkout(amount * 100, 'eur', webPage);
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
        {donated === '1' ? (
          <View style={styles.thanks}>
            <Ionicons name="heart" size={22} color={c.danger} />
            <Text variant="heading" style={{ flex: 1 }}>
              {tr('pages.donate.thanks')}
            </Text>
          </View>
        ) : enabled === false ? (
          <Text tone="muted">{tr('pages.donate.soon')}</Text>
        ) : !web ? (
          <>
            <Text tone="muted">{tr('pages.donate.onWeb')}</Text>
            {webPage ? (
              <Button title={tr('pages.donate.openWeb')} onPress={() => void Linking.openURL(webPage)} rightIcon={<Ionicons name="open-outline" size={16} color={c.onAccent} />} />
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.amounts}>
              {AMOUNTS.map((a) => {
                const on = a === amount;
                return (
                  <Pressable
                    key={a}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setAmount(a)}
                    style={[styles.amount, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.surface }]}>
                    <Text variant="figure" color={on ? c.onAccent : c.text} style={{ fontSize: 22 }}>
                      €{a}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Button title={tr('pages.donate.give', { amount: `€${amount}` })} onPress={pay} loading={busy} disabled={enabled === null} leftIcon={<Ionicons name="heart" size={16} color={c.onAccent} />} />
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
});
