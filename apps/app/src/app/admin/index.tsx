import { router } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { useAdmin } from '@/features/admin/AdminContext';
import { AdminSectionLinks } from '@/features/admin/AdminNav';
import { AuditRow } from '@/features/admin/AuditRow';
import { AdminPage, DailyBars, EmptyState, ErrorLine, PageHeader, Section, StatTile, TileGrid, useLoad } from '@/features/admin/ui';
import { useT } from '@/i18n';
import { Badge, Button, Row, Stack } from '@/ui';

export default function AdminDashboard() {
  const tr = useT();
  const { api, me, can } = useAdmin();
  const wide = useWindowDimensions().width >= 960;
  const { data: d, error, loading, reload } = useLoad(() => api.dashboard(), [api]);

  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!d}>
      <PageHeader
        title={tr('admin.nav.dashboard')}
        subtitle={tr('admin.dashboard.subtitle')}
        right={
          <Row gap="sm">
            <Badge label={tr(`admin.roles.${me.role}`)} tone={me.role === 'admin' ? 'solid' : 'outline'} />
            <Button title={tr('admin.common.refresh')} variant="secondary" size="sm" loading={loading} onPress={reload} />
          </Row>
        }
      />
      <ErrorLine message={error} />
      {!wide && <AdminSectionLinks />}
      {d && (
        <>
          <Section title={tr('admin.dashboard.live')} index={1} padding="none">
            <Stack style={{ padding: 10 }}>
              <TileGrid>
                <StatTile icon="radio-outline" label={tr('admin.dashboard.online')} value={d.live.playersOnline} />
                <StatTile icon="game-controller-outline" label={tr('admin.dashboard.inProgress')} value={d.live.gamesInProgress} onPress={can('games.view') ? () => router.push('/admin/games') : undefined} />
                <StatTile icon="hourglass-outline" label={tr('admin.dashboard.seeking')} value={d.live.playersSeeking} />
              </TileGrid>
            </Stack>
          </Section>

          <Section title={tr('admin.dashboard.queues')} index={2} padding="none">
            <Stack style={{ padding: 10 }}>
              <TileGrid>
                <StatTile icon="flag-outline" tone="danger" label={tr('admin.dashboard.openReports')} value={d.queues.openReports} onPress={() => router.push('/admin/reports')} />
                <StatTile icon="shield-checkmark-outline" tone="warning" label={tr('admin.dashboard.openFairPlay')} value={d.queues.openFairPlay} onPress={() => router.push('/admin/fairplay')} />
                <StatTile icon="volume-mute-outline" label={tr('admin.dashboard.activeMutes')} value={d.queues.activeMutes} onPress={() => router.push('/admin/players?filter=muted')} />
                <StatTile icon="warning-outline" label={tr('admin.dashboard.warnings7d')} value={d.queues.warnings7d} />
                {can('titles.review') && <StatTile icon="ribbon-outline" label={tr('admin.dashboard.titleApplications')} value={d.queues.titleApplications} onPress={() => router.push('/admin/titles')} />}
              </TileGrid>
            </Stack>
          </Section>

          <Row gap="xl" align="flex-start" wrap>
            <Stack gap="xl" style={{ flexGrow: 1, flexBasis: 420 }}>
              <Section title={tr('admin.dashboard.accounts')} index={3} padding="none">
                <Stack style={{ padding: 10 }}>
                  <TileGrid>
                    <StatTile label={tr('admin.dashboard.total')} value={d.accounts.total} onPress={() => router.push('/admin/players')} />
                    <StatTile label={tr('admin.dashboard.new24h')} value={d.accounts.new24h} hint={`${tr('admin.dashboard.new7d')}: ${d.accounts.new7d}`} />
                    <StatTile label={tr('admin.dashboard.closed')} value={d.accounts.closed} onPress={() => router.push('/admin/players?filter=closed')} />
                    <StatTile label={tr('admin.dashboard.staff')} value={d.accounts.staff} onPress={() => router.push('/admin/players?filter=staff')} />
                  </TileGrid>
                </Stack>
              </Section>
              <Section title={tr('admin.dashboard.games')} index={4} padding="none">
                <Stack style={{ padding: 10 }}>
                  <TileGrid>
                    <StatTile label={tr('admin.dashboard.games24h')} value={d.games.last24h} />
                    <StatTile label={tr('admin.dashboard.rated24h')} value={d.games.rated24h} />
                    <StatTile label={tr('admin.dashboard.gamesTotal')} value={d.games.total} />
                  </TileGrid>
                </Stack>
              </Section>
            </Stack>
            <Stack gap="xl" style={{ flexGrow: 1, flexBasis: 360 }}>
              <Section title={tr('admin.dashboard.activity')} index={5}>
                <Row gap="xl" wrap align="flex-start">
                  <DailyBars title={tr('admin.dashboard.signups')} data={d.daily.map((x) => ({ day: x.day, value: x.signups }))} />
                  <DailyBars title={tr('admin.dashboard.gamesPlayed')} data={d.daily.map((x) => ({ day: x.day, value: x.games }))} />
                </Row>
              </Section>
              {can('audit.view') && (
                <Section
                  title={tr('admin.dashboard.recent')}
                  index={6}
                  padding="none"
                  action={<Button title={tr('admin.dashboard.seeAll')} variant="ghost" size="sm" onPress={() => router.push('/admin/audit')} />}>
                  {d.recent.length === 0 ? (
                    <EmptyState icon="document-text-outline" title={tr('admin.dashboard.noRecent')} />
                  ) : (
                    d.recent.map((e, i) => <AuditRow key={e.id} e={e} last={i === d.recent.length - 1} compact />)
                  )}
                </Section>
              )}
            </Stack>
          </Row>
        </>
      )}
    </AdminPage>
  );
}
