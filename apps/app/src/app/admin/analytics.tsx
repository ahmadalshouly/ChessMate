import { ANALYTICS_RANGES, type AnalyticsCount, type AnalyticsRange, type AnalyticsReport, type AnalyticsRecentEvent } from '@chessmate/core';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Segmented } from '@/components/play/Controls';
import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, DailyBars, EmptyState, ErrorLine, PageHeader, Section, StatTile, TileGrid, useLoad } from '@/features/admin/ui';
import { countryLabel } from '@/i18n/chess';
import { formatAgo, formatNumber, translateOr, useT, type TFunction } from '@/i18n';
import { analyticsGoogleName } from '@/lib/analytics';
import { Button, Row, Stack, Text, useAppTheme } from '@/ui';

/**
 * Admin → Analytics. The top half is counted from the game's own tables, so it
 * covers every player; "App usage" comes from the app's analytics events, which
 * only visitors who allowed analytics send. The same events go to Google
 * Analytics (GA4 / Firebase), which has its own, deeper reports.
 */
export default function AdminAnalytics() {
  const tr = useT();
  const { api } = useAdmin();
  const [days, setDays] = useState<AnalyticsRange>(30);
  const { data: r, error, loading, reload } = useLoad(() => api.analytics(days), [api, days]);
  const google = analyticsGoogleName();

  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!r}>
      <PageHeader
        title={tr('admin.nav.analytics')}
        subtitle={tr('admin.analytics.subtitle')}
        right={
          <Row gap="sm" wrap>
            <Segmented<AnalyticsRange> size="sm" value={days} onChange={setDays} options={ANALYTICS_RANGES.map((d) => ({ value: d, label: tr(`admin.analytics.d${d}`) }))} />
            <Button title={tr('admin.common.refresh')} variant="secondary" size="sm" loading={loading} onPress={reload} />
          </Row>
        }
      />
      <ErrorLine message={error} />
      {r && <Report r={r} tr={tr} google={google} />}
    </AdminPage>
  );
}

function Report({ r, tr, google }: { r: AnalyticsReport; tr: TFunction; google: string | null }) {
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const t = r.totals;
  const daily = (key: keyof AnalyticsReport['daily'][number]) => r.daily.map((d) => ({ day: d.day, value: Number(d[key]) }));
  const median = r.app.medianSessionSeconds;
  const typicalVisit = median >= 60 ? tr('admin.analytics.minutes', { n: Math.round(median / 60) }) : tr('admin.analytics.seconds', { n: median });
  const appEmpty = r.app.events === 0;

  return (
    <>
      <Text variant="caption" tone="tertiary">
        {tr('admin.analytics.updated', { time: formatAgo(r.generatedAt) })}
      </Text>

      <Section title={tr('admin.analytics.active')} index={1} padding="none">
        <Stack style={{ padding: 10 }}>
          <TileGrid>
            <StatTile icon="radio-outline" label={tr('admin.analytics.live')} value={r.live.playersOnline} hint={`${tr('admin.dashboard.inProgress')}: ${r.live.gamesInProgress}`} />
            <StatTile label={tr('admin.analytics.activeDay')} value={r.active.day} />
            <StatTile label={tr('admin.analytics.activeWeek')} value={r.active.week} />
            <StatTile label={tr('admin.analytics.activeMonth')} value={r.active.month} />
            <StatTile label={tr('admin.analytics.accounts')} value={r.active.total} />
          </TileGrid>
        </Stack>
      </Section>

      <Section title={tr('admin.analytics.period')} index={2} padding="none">
        <Stack style={{ padding: 10 }}>
          <TileGrid>
            <StatTile icon="person-add-outline" label={tr('admin.analytics.signups')} value={t.signups} />
            <StatTile icon="game-controller-outline" label={tr('admin.analytics.games')} value={t.games} hint={tr('admin.analytics.rated', { n: formatNumber(t.ratedGames) })} />
            <StatTile icon="extension-puzzle-outline" label={tr('admin.analytics.puzzles')} value={t.puzzles} hint={tr('admin.analytics.solved', { pct: pct(t.puzzlesSolved, t.puzzles) })} />
            <StatTile icon="analytics-outline" label={tr('admin.analytics.reviews')} value={t.reviews} />
            <StatTile icon="trophy-outline" label={tr('admin.analytics.tournamentJoins')} value={t.tournamentJoins} />
            <StatTile icon="chatbubbles-outline" label={tr('admin.analytics.messages')} value={t.messages} />
          </TileGrid>
        </Stack>
      </Section>

      <Section title={tr('admin.analytics.daily')} index={3}>
        <Row gap="xl" wrap align="flex-start">
          <DailyBars title={tr('admin.analytics.signups')} data={daily('signups')} />
          <DailyBars title={tr('admin.analytics.games')} data={daily('games')} />
          <DailyBars title={tr('admin.analytics.players')} data={daily('players')} />
          <DailyBars title={tr('admin.analytics.puzzles')} data={daily('puzzles')} />
          <DailyBars title={tr('admin.analytics.reviews')} data={daily('reviews')} />
        </Row>
      </Section>

      <Row gap="xl" align="flex-start" wrap>
        <Stack gap="xl" style={styles.col}>
          <Section title={tr('admin.analytics.retention')} index={4}>
            <Stack gap="md">
              <Text variant="caption" tone="muted">
                {tr('admin.analytics.retentionHint', { n: formatNumber(r.retention.cohort) })}
              </Text>
              <Meter label={tr('admin.analytics.day1')} value={r.retention.day1} of={r.retention.cohort} />
              <Meter label={tr('admin.analytics.day7')} value={r.retention.day7} of={r.retention.cohort} />
            </Stack>
          </Section>
          <Section title={tr('admin.analytics.signupMethods')} index={5}>
            <Counts list={r.signupMethods} label={(k) => translateOr(`admin.analytics.methodName.${k}`, k)} />
          </Section>
          <Section title={tr('admin.analytics.timeCategories')} index={6}>
            <Counts list={r.timeCategories} label={(k) => translateOr(`common.category.${k}`, k)} />
          </Section>
        </Stack>
        <Stack gap="xl" style={styles.col}>
          <Section title={tr('admin.analytics.openings')} index={7}>
            <Counts list={r.openings} />
          </Section>
          <Section title={tr('admin.analytics.countries')} index={8}>
            <Counts list={r.countries} label={(k) => countryLabel(k) ?? k} />
          </Section>
          <Section title={tr('admin.analytics.sponsors')} index={9}>
            {r.sponsors.length === 0 ? (
              <Text tone="muted">{tr('admin.analytics.none')}</Text>
            ) : (
              <Stack gap="sm">
                {r.sponsors.map((s) => (
                  <Row key={s.spot} justify="space-between" gap="md">
                    <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
                      {s.spot}
                    </Text>
                    <Text variant="numeric" tone="muted">
                      {`${tr('admin.analytics.impressions')} ${formatNumber(s.impressions)} · ${tr('admin.analytics.clicks')} ${formatNumber(s.clicks)} · ${tr('admin.analytics.ctr', { pct: pct(s.clicks, s.impressions) })}`}
                    </Text>
                  </Row>
                ))}
              </Stack>
            )}
          </Section>
        </Stack>
      </Row>

      <Section
        title={tr('admin.analytics.app')}
        index={10}
        action={
          google?.startsWith('Google Analytics 4') ? (
            <Button title={tr('admin.analytics.openGa')} variant="ghost" size="sm" onPress={() => void Linking.openURL('https://analytics.google.com/').catch(() => {})} />
          ) : undefined
        }>
        <Stack gap="md">
          <Text variant="caption" tone="muted">
            {tr('admin.analytics.appHint')} {google ? tr('admin.analytics.googleOn', { name: google }) : tr('admin.analytics.googleOff')}
          </Text>
          {appEmpty ? (
            <EmptyState icon="analytics-outline" title={tr('admin.analytics.noApp')} />
          ) : (
            <>
              <TileGrid>
                <StatTile icon="phone-portrait-outline" label={tr('admin.analytics.devices')} value={r.app.devices} />
                <StatTile icon="enter-outline" label={tr('admin.analytics.sessions')} value={r.app.sessions} />
                <StatTile icon="pulse-outline" label={tr('admin.analytics.events')} value={r.app.events} />
                <StatTile icon="time-outline" label={tr('admin.analytics.sessionLength')} value={typicalVisit} />
              </TileGrid>
              <Row gap="xl" wrap align="flex-start">
                <DailyBars title={tr('admin.analytics.dailyDevices')} data={daily('devices')} />
                <DailyBars title={tr('admin.analytics.dailySessions')} data={daily('sessions')} />
              </Row>
            </>
          )}
        </Stack>
      </Section>

      {!appEmpty && (
        <>
          <Row gap="xl" align="flex-start" wrap>
            <Stack gap="xl" style={styles.col}>
              <Section title={tr('admin.analytics.funnel')} index={11}>
                <Stack gap="md">
                  <Meter label={tr('admin.analytics.opened')} value={r.app.funnel.opened} of={r.app.funnel.opened} />
                  <Meter label={tr('admin.analytics.signedUp')} value={r.app.funnel.signedUp} of={r.app.funnel.opened} />
                  <Meter label={tr('admin.analytics.startedGame')} value={r.app.funnel.startedGame} of={r.app.funnel.opened} />
                  <Meter label={tr('admin.analytics.finishedGame')} value={r.app.funnel.finishedGame} of={r.app.funnel.opened} />
                </Stack>
              </Section>
              <Section title={tr('admin.analytics.platforms')} index={12}>
                <Counts list={r.app.platforms} label={(k) => translateOr(`admin.analytics.platformName.${k}`, k)} />
              </Section>
              <Section title={tr('admin.analytics.languages')} index={13}>
                <Counts list={r.app.languages} />
              </Section>
              <Section title={tr('admin.analytics.versions')} index={14}>
                <Counts list={r.app.versions} />
              </Section>
            </Stack>
            <Stack gap="xl" style={styles.col}>
              <Section title={tr('admin.analytics.screens')} index={15}>
                <Counts list={r.app.screens} mono />
              </Section>
              <Section title={tr('admin.analytics.topEvents')} index={16}>
                <Counts list={r.app.topEvents} label={(k) => translateOr(`admin.analytics.eventName.${k}`, k)} />
              </Section>
            </Stack>
          </Row>
          <Section title={tr('admin.analytics.recent')} index={17} padding="none">
            {r.app.recent.map((e, i) => (
              <RecentRow key={`${e.at}-${i}`} e={e} tr={tr} last={i === r.app.recent.length - 1} />
            ))}
          </Section>
        </>
      )}
    </>
  );
}

/** Ranked counts with a bar proportional to the largest. */
function Counts({ list, label, mono }: { list: AnalyticsCount[]; label?: (key: string) => string; mono?: boolean }) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  if (list.length === 0) return <Text tone="muted">{tr('admin.analytics.none')}</Text>;
  const max = Math.max(1, ...list.map((x) => x.count));
  return (
    <Stack gap="sm">
      {list.map((x) => (
        <Stack key={x.key} gap="xs">
          <Row justify="space-between" gap="md">
            <Text variant={mono ? 'mono' : 'label'} style={{ flex: 1 }} numberOfLines={1}>
              {label ? label(x.key) : x.key}
            </Text>
            <Text variant="numeric" tone="muted">
              {x.devices !== undefined ? `${formatNumber(x.count)} · ${formatNumber(x.devices)} ${tr('admin.analytics.devices')}` : formatNumber(x.count)}
            </Text>
          </Row>
          <View style={[styles.track, { backgroundColor: c.surfaceSunken }]}>
            <View style={[styles.fill, { width: `${Math.max(2, (x.count / max) * 100)}%`, backgroundColor: c.text }]} />
          </View>
        </Stack>
      ))}
    </Stack>
  );
}

function Meter({ label, value, of }: { label: string; value: number; of: number }) {
  const { colors: c } = useAppTheme();
  const share = of > 0 ? value / of : 0;
  return (
    <Stack gap="xs">
      <Row justify="space-between" gap="md">
        <Text variant="label">{label}</Text>
        <Text variant="numeric" tone="muted">{`${formatNumber(value)} · ${Math.round(share * 100)}%`}</Text>
      </Row>
      <View style={[styles.track, { backgroundColor: c.surfaceSunken }]}>
        <View style={[styles.fill, { width: `${Math.max(2, share * 100)}%`, backgroundColor: c.text }]} />
      </View>
    </Stack>
  );
}

function RecentRow({ e, tr, last }: { e: AnalyticsRecentEvent; tr: TFunction; last: boolean }) {
  const { colors: c } = useAppTheme();
  const props = e.props ? Object.entries(e.props).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') : '';
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      <Stack gap="xs" style={{ flex: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {translateOr(`admin.analytics.eventName.${e.name}`, e.name)}
          {e.screen ? <Text variant="mono" tone="tertiary">{`  ${e.screen}`}</Text> : null}
        </Text>
        {props ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {props}
          </Text>
        ) : null}
      </Stack>
      <Stack gap="xs" style={{ alignItems: 'flex-end' }}>
        <Text variant="caption" tone="muted">
          {e.username ?? tr('admin.analytics.guest')}
        </Text>
        <Text variant="caption" tone="tertiary">
          {`${translateOr(`admin.analytics.platformName.${e.platform}`, e.platform)} · ${formatAgo(e.at)}`}
        </Text>
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { flexGrow: 1, flexBasis: 380 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
});
