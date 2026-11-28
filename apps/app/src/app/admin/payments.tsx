import { formatMoney } from '@chessmate/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { paymentTone } from '@/features/sponsors/Conversation';
import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, PageHeader, Section, StatTile, TileGrid, useLoad } from '@/features/admin/ui';
import { formatDateTime, useT } from '@/i18n';
import { Badge, Row, Stack, Switch, Text, useAppTheme, useToast } from '@/ui';

const totals = (t: Record<string, { cents: number; count: number }>) => {
  const list = Object.entries(t);
  return { value: list.length ? list.map(([cur, v]) => formatMoney(v.cents, cur)).join(' · ') : '0', count: list.reduce((n, [, v]) => n + v.count, 0) };
};

/** Stripe at a glance: is it set up, sponsor payment links and their status, donations. Admins only. */
export default function AdminPayments() {
  const tr = useT();
  const { api } = useAdmin();
  const c = useAppTheme().colors;
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.payments(), [api]);
  const [supportShown, setSupportShown] = useState<boolean | null>(null);
  const [switching, setSwitching] = useState(false);
  const shown = supportShown ?? data?.supportShown ?? true;
  const switchSupport = async (v: boolean) => {
    setSwitching(true);
    try {
      setSupportShown((await api.setSupportShown(v)).shown);
      toast.show({ title: tr(v ? 'admin.payments.supportOn' : 'admin.payments.supportOff'), tone: 'success' });
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
    } finally {
      setSwitching(false);
    }
  };
  const last30 = data ? totals(data.donations.last30) : null;
  const all = data ? totals(data.donations.allTime) : null;
  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader title={tr('admin.nav.payments')} subtitle={tr('admin.payments.subtitle')} />
      <ErrorLine message={error} />
      {data ? (
        <Stack gap="lg">
          <Text tone={!data.enabled || !data.webhook ? 'warning' : 'success'}>{!data.enabled ? tr('admin.payments.off') : !data.webhook ? tr('admin.payments.noWebhook') : tr('admin.payments.ready')}</Text>

          <Section title={tr('admin.payments.supportTitle')}>
            <Row justify="space-between" gap="md">
              <Stack gap="xs" style={{ flex: 1 }}>
                <Text variant="subheading">{tr(shown ? 'admin.payments.supportOn' : 'admin.payments.supportOff')}</Text>
                <Text variant="caption" tone="muted">
                  {tr('admin.payments.supportBody')}
                </Text>
              </Stack>
              <Switch value={shown} disabled={switching} onValueChange={(v) => void switchSupport(v)} accessibilityLabel={tr('admin.payments.supportTitle')} />
            </Row>
          </Section>

          <Section title={tr('admin.payments.donations')} padding="none">
            <View style={{ padding: 16, gap: 16 }}>
              <TileGrid>
                <StatTile icon="heart-outline" label={tr('admin.payments.last30')} value={last30!.value} hint={tr('admin.payments.count', { count: last30!.count })} />
                <StatTile icon="stats-chart-outline" label={tr('admin.payments.allTime')} value={all!.value} hint={tr('admin.payments.count', { count: all!.count })} />
              </TileGrid>
              {data.donations.recent.length ? (
                <Stack gap="xs">
                  <Text variant="overline" tone="muted">
                    {tr('admin.payments.recent')}
                  </Text>
                  {data.donations.recent.slice(0, 30).map((d) => (
                    <Row key={d.id} justify="space-between" gap="sm">
                      <Text variant="caption" tone="muted" style={{ flexShrink: 1 }} selectable>
                        {`${formatDateTime(d.paidAt ?? d.createdAt)} · ${d.email ?? tr('admin.payments.anonymous')}`}
                      </Text>
                      <Text variant="figure">{formatMoney(d.amountCents, d.currency)}</Text>
                    </Row>
                  ))}
                </Stack>
              ) : (
                <Text tone="muted">{tr('admin.payments.noDonations')}</Text>
              )}
            </View>
          </Section>

          <Section title={tr('admin.payments.sponsorPayments')} padding="none">
            {data.sponsorPayments.length ? (
              data.sponsorPayments.map((p, i) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/admin/sponsors/${p.applicationId}`)}
                  style={({ pressed }) => ({ padding: 14, gap: 4, borderTopWidth: i ? 1 : 0, borderColor: c.border, opacity: pressed ? 0.7 : 1 })}>
                  <Row justify="space-between" gap="sm" wrap>
                    <Text variant="subheading" style={{ flexShrink: 1 }}>{`${p.sponsor}: ${p.description}`}</Text>
                    <Row gap="sm">
                      <Text variant="figure">{formatMoney(p.amountCents, p.currency)}</Text>
                      <Badge label={tr(`admin.sponsors.paymentStatus.${p.status}`)} tone={paymentTone(p.status)} />
                    </Row>
                  </Row>
                  <Text variant="caption" tone="tertiary">
                    {tr('admin.sponsors.by', { name: p.createdBy ?? '?', date: formatDateTime(p.createdAt) })}
                  </Text>
                </Pressable>
              ))
            ) : (
              <View style={{ padding: 16 }}>
                <EmptyState icon="card-outline" title={tr('admin.payments.noSponsorPayments')} />
              </View>
            )}
          </Section>
        </Stack>
      ) : null}
    </AdminPage>
  );
}
