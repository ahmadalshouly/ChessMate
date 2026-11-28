import Ionicons from '@expo/vector-icons/Ionicons';
import { AD_SPOT_KEY, SPONSOR_MESSAGE_MAX, type SponsorPortalView } from '@chessmate/core';
import { Stack as RouterStack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { SponsorConversation, money, paymentTone } from '@/features/sponsors/Conversation';
import { formatDate, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { sponsorshipApi } from '@/lib/tournamentsApi';
import { Badge, Button, GlassView, Row, Text, TextField, useAppTheme } from '@/ui';
import { KeyboardScrollView } from '@/ui/components/Keyboard';

/**
 * Paying happens on the web only. Sponsorship is bought by companies and
 * shows inside the app, so Apple and Google could see an in-app pay button as
 * a digital purchase outside their billing. The phones show the status and
 * the conversation, and point to the emailed link.
 */
const CAN_PAY_HERE = Platform.OS === 'web';

/**
 * A sponsor applicant's own page, opened from the link in our emails. The
 * token in the address is the key: no account needed. Shows the application,
 * the conversation with the team (with a reply box) and the payment links.
 */
export default function SponsorshipPage() {
  const tr = useT();
  const t = useAppTheme();
  const c = t.colors;
  const insets = useSafeAreaInsets();
  const { token, paid } = useLocalSearchParams<{ token: string; paid?: string }>();
  const [page, setPage] = useState<SponsorPortalView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(() => {
    sponsorshipApi.get(String(token)).then(
      (p) => {
        setError(null);
        setPage(p);
      },
      (e: Error) => setError(e.message),
    );
  }, [token]);
  useEffect(() => {
    load();
    // New answers and payment confirmations show up without a reload; faster right after paying.
    const every = setInterval(load, paid === '1' ? 4_000 : 30_000);
    return () => clearInterval(every);
  }, [load, paid]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setSendError(null);
    try {
      setPage(await sponsorshipApi.reply(String(token), body));
      setDraft('');
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  // Back from Stripe before the webhook arrived: say it's being confirmed until the link shows as paid.
  const justPaid = paid === '1' && !!page && page.payments.some((p) => p.status === 'open' || p.status === 'processing');
  const closed = page?.status === 'declined';

  return (
    <KeyboardScrollView contentContainerStyle={[styles.page, { paddingBottom: 40 + insets.bottom }]}>
      <RouterStack.Screen options={{ title: tr('sponsorship.title') }} />
      <View style={[styles.inner, { gap: t.space.lg }]}>
        <View style={{ gap: t.space.sm }}>
          <Text variant="title">{page?.company ?? page?.name ?? tr('sponsorship.title')}</Text>
          <Text tone="muted">{tr('sponsorship.intro')}</Text>
        </View>

        {error ? (
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
            <Ionicons name="alert-circle-outline" size={24} color={c.danger} />
            <Text>{serverText(error)}</Text>
          </GlassView>
        ) : !page ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {justPaid ? (
              <GlassView padding="lg" radius="xl" style={styles.row}>
                <Ionicons name="checkmark-circle" size={24} color={c.success} />
                <Text style={{ flex: 1 }}>{tr('sponsorship.thanks')}</Text>
              </GlassView>
            ) : null}

            <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
              <Row justify="space-between" wrap gap="sm">
                <Text variant="subheading">{tr('sponsorship.yourApplication')}</Text>
                <Badge label={tr(`sponsorship.status.${page.status}`)} tone={page.status === 'accepted' ? 'success' : page.status === 'declined' ? 'outline' : 'solid'} />
              </Row>
              <Text variant="caption" tone="muted">
                {[tr('sponsorship.applied', { date: formatDate(page.createdAt) }), page.spot ? tr('sponsorship.spot', { spot: tr(`ads.spot.${AD_SPOT_KEY[page.spot]}`) }) : null].filter(Boolean).join(' · ')}
              </Text>
              <Text tone="muted" selectable>
                {page.message}
              </Text>
            </GlassView>

            {page.payments.length ? (
              <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
                <Text variant="subheading">{tr('sponsorship.payments')}</Text>
                {page.payments.map((p) => (
                  <View key={p.id} style={[styles.payment, { borderColor: c.border }]}>
                    <Row justify="space-between" wrap gap="sm">
                      <Text variant="heading" style={{ flexShrink: 1 }}>
                        {p.description}
                      </Text>
                      <Text variant="figure" style={{ fontSize: 20 }}>
                        {money(p.amountCents, p.currency)}
                      </Text>
                    </Row>
                    <Row gap="sm" wrap align="center">
                      <Badge label={tr(`sponsorship.paymentStatus.${p.status}`)} tone={paymentTone(p.status)} />
                      {p.paidAt ? (
                        <Text variant="caption" tone="tertiary">
                          {tr('sponsorship.paidOn', { date: formatDate(p.paidAt) })}
                        </Text>
                      ) : null}
                    </Row>
                    {p.url && CAN_PAY_HERE ? (
                      <Button title={tr('sponsorship.pay', { amount: money(p.amountCents, p.currency) })} onPress={() => void Linking.openURL(p.url!)} leftIcon={<Ionicons name="card-outline" size={16} color={c.onAccent} />} />
                    ) : p.url ? (
                      <Text variant="caption" tone="muted">
                        {tr('sponsorship.payOnWeb')}
                      </Text>
                    ) : null}
                  </View>
                ))}
                <Text variant="caption" tone="tertiary">
                  {tr('sponsorship.secure')}
                </Text>
              </GlassView>
            ) : null}

            <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
              <Text variant="subheading">{tr('sponsorship.conversation')}</Text>
              {page.messages.length ? (
                <SponsorConversation messages={page.messages} side="applicant" names={{ mine: tr('sponsorship.you'), theirs: tr('sponsorship.team') }} />
              ) : (
                <Text tone="muted">{tr('sponsorship.empty')}</Text>
              )}
              {closed ? (
                <Text tone="muted">{tr('sponsorship.closed')}</Text>
              ) : (
                <View style={{ gap: t.space.sm }}>
                  <TextField label={tr('sponsorship.replyPlaceholder')} value={draft} onChangeText={setDraft} multiline maxLength={SPONSOR_MESSAGE_MAX} />
                  {sendError ? <Text tone="danger">{serverText(sendError)}</Text> : null}
                  <Button title={tr('sponsorship.send')} loading={sending} disabled={!draft.trim()} onPress={() => void send()} leftIcon={<Ionicons name="send" size={14} color={c.onAccent} />} />
                </View>
              )}
            </GlassView>
          </>
        )}
      </View>
    </KeyboardScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payment: { gap: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
