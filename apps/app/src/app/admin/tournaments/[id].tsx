import { formatMoney, formatTimeControl } from '@chessmate/core';
import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, ErrorLine, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { tournamentClock } from '@/features/tournaments/format';
import { SponsorBadge } from '@/features/tournaments/SponsorBadge';
import { formatDateTime, useT } from '@/i18n';
import { Badge, Button, GlassView, Row, Stack, Text, useToast } from '@/ui';

/**
 * Live monitor of one tournament for staff: refreshes every few seconds; shows
 * standings, games to watch, every player (paid, paused, removed, rules
 * accepted) and entry fee payments. Staff can remove a player.
 */
export default function AdminTournamentMonitor() {
  const tr = useT();
  const toast = useToast();
  const { api } = useAdmin();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: t, error, loading, reload } = useLoad(() => api.tournamentMonitor(id!), [api, id]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (t?.status !== 'running' && t?.status !== 'scheduled') return;
    const timer = setInterval(reload, 4000);
    return () => clearInterval(timer);
  }, [t?.status, reload]);

  const remove = async (userId: string, name: string) => {
    setBusy(userId);
    try {
      await api.removeTournamentPlayer(id!, userId, '');
      toast.show({ title: tr('admin.tournaments.removed', { name }), tone: 'success' });
      reload();
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!t}>
      <RouterStack.Screen options={{ title: t?.name ?? tr('admin.nav.tournaments') }} />
      <PageHeader
        title={t?.name ?? '…'}
        subtitle={t ? `${formatTimeControl(t.timeControl)} · ${tournamentClock(t)} · ${formatDateTime(t.startsAt)}` : undefined}
        right={<Button size="sm" variant="ghost" title={tr('admin.tournaments.view')} onPress={() => router.push({ pathname: '/tournaments/[id]', params: { id: id! } })} />}
      />
      <ErrorLine message={error} />
      {t && (
        <>
          <Row gap="sm" wrap>
            <Badge label={tr(`admin.tournaments.status.${t.status}`)} tone={t.status === 'running' ? 'live' : 'neutral'} />
            <Badge label={tr('tournaments.players', { count: t.players, n: t.players })} tone="outline" />
            <Badge label={t.entryFeeCents ? tr('tournaments.entryFee', { fee: formatMoney(t.entryFeeCents, t.currency) }) : tr('tournaments.free')} tone="outline" />
            {t.entryFeeCents > 0 && <Badge label={tr('admin.tournaments.revenue', { amount: formatMoney(t.revenueCents, t.currency) })} tone="solid" />}
            <Badge label={tr('admin.tournaments.liveCount', { count: t.liveGames.length })} tone={t.liveGames.length ? 'live' : 'neutral'} />
          </Row>
          {t.sponsor && <SponsorBadge sponsor={t.sponsor} />}

          <Section title={tr('tournaments.liveGames')} index={1}>
            {t.liveGames.length === 0 ? (
              <Text tone="muted">{tr('admin.tournaments.noLiveGames')}</Text>
            ) : (
              <Stack gap="sm">
                {t.liveGames.map((g) => (
                  <Row key={g.gameId} justify="space-between" wrap gap="sm">
                    <Text>{`${g.white} – ${g.black}`}</Text>
                    <Button size="sm" variant="secondary" title={tr('friends.watch')} onPress={() => router.push(`/watch/${g.gameId}`)} />
                  </Row>
                ))}
              </Stack>
            )}
          </Section>

          <Section title={tr('admin.tournaments.roster')} index={2}>
            <Stack gap="sm">
              {t.roster.length === 0 && <Text tone="muted">{tr('tournaments.noPlayers')}</Text>}
              {t.roster.map((p) => (
                <GlassView key={p.userId} radius="md" padding="md" flat>
                  <Row justify="space-between" wrap gap="sm">
                    <Stack gap="xxs" style={{ flex: 1, minWidth: 200 }}>
                      <Row gap="sm" wrap>
                        <Text variant="label">{p.username}</Text>
                        {p.playing && <Badge size="sm" tone="live" label={tr('tournaments.playingNow')} />}
                        {p.withdrawn && !p.disqualified && <Badge size="sm" tone="outline" label={tr('tournaments.paused')} />}
                        {p.disqualified && <Badge size="sm" tone="danger" label={tr('admin.tournaments.disqualified')} />}
                        {t.entryFeeCents > 0 && <Badge size="sm" tone={p.paid ? 'solid' : 'outline'} label={p.paid ? tr('admin.tournaments.paid') : tr('admin.tournaments.unpaid')} />}
                      </Row>
                      <Text variant="caption" tone="muted">
                        {`${p.rating} · ${tr('admin.tournaments.scoreLine', { score: p.score, games: p.games })} · ${p.rulesAcceptedAt ? tr('admin.tournaments.rulesAccepted', { date: formatDateTime(p.rulesAcceptedAt) }) : tr('admin.tournaments.rulesNotAccepted')}`}
                      </Text>
                    </Stack>
                    <Row gap="sm">
                      <Button size="sm" variant="ghost" title={tr('admin.tournaments.profile')} onPress={() => router.push({ pathname: '/admin/players/[id]', params: { id: p.userId } })} />
                      {!p.disqualified && t.status !== 'finished' && t.status !== 'cancelled' && (
                        <Button size="sm" variant="danger" title={tr('admin.tournaments.remove')} loading={busy === p.userId} onPress={() => void remove(p.userId, p.username)} />
                      )}
                    </Row>
                  </Row>
                </GlassView>
              ))}
            </Stack>
          </Section>

          {t.payments.length > 0 && (
            <Section title={tr('admin.tournaments.payments')} index={3}>
              <Stack gap="xs">
                {t.payments.map((p, i) => (
                  <Text key={i} variant="caption">
                    {`${formatDateTime(p.createdAt)} · ${t.roster.find((r) => r.userId === p.userId)?.username ?? p.userId} · ${formatMoney(p.amountCents, p.currency)} · ${tr(`admin.tournaments.paymentStatus.${p.status === 'paid' || p.status === 'expired' || p.status === 'refunded' ? p.status : 'pending'}`)}`}
                  </Text>
                ))}
              </Stack>
            </Section>
          )}
        </>
      )}
    </AdminPage>
  );
}
