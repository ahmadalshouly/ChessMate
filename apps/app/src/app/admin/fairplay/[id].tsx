import type { AdminEngineReport, AdminFairPlayGame } from '@chessmate/core';
import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionDialog, ReasonField } from '@/features/admin/ActionDialog';
import { canAnalyzeHere, useCaseAnalysis } from '@/features/admin/caseAnalysis';
import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, Field, PlayerBadges, ScoreMeter, Section, StatTile, TileGrid, useLoad } from '@/features/admin/ui';
import { formatAgo, formatDateTime, translateOr, useT } from '@/i18n';
import { Badge, Button, Row, Stack, Text, useAppTheme } from '@/ui';

type Dialog = 'dismiss' | 'ban' | 'open' | 'refund' | null;

/** How far back a bulk refund can reach, in rated games. */
const REFUND_CHOICES = [5, 10, 15, 20];

export default function AdminFairPlayCase() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const { api, can } = useAdmin();
  const { data: f, loading, error, reload } = useLoad(() => api.fairPlayFile(String(id)), [api, id]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState('');
  const [refundGames, setRefundGames] = useState(10);
  const [refunded, setRefunded] = useState<{ players: number; points: number } | null>(null);
  const scan = useCaseAnalysis(api, String(id), reload);
  if (!f) {
    return (
      <AdminPage>
        <RouterStack.Screen options={{ title: tr('admin.nav.fairplay'), headerShown: true }} />
        {loading ? <Text tone="muted">{tr('admin.common.loading')}</Text> : <EmptyState icon="shield-outline" title={tr('admin.fairplay.noCase')} body={error ?? undefined} />}
      </AdminPage>
    );
  }
  const name = f.player?.username ?? f.case?.username ?? String(id);
  const a = f.case?.assessment;
  const closed = f.case?.status === 'banned' || f.player?.fairPlay === 'banned';
  const done = async (fn: () => Promise<unknown>) => {
    await fn();
    setNote('');
    reload();
  };
  return (
    <AdminPage onRefresh={reload} refreshing={loading}>
      <RouterStack.Screen options={{ title: name, headerShown: true }} />
      <Row gap="lg" justify="space-between" align="flex-start" wrap>
        <Stack gap="xs" style={{ flex: 1, minWidth: 240 }}>
          <Text variant="overline" tone="tertiary">
            {tr('admin.nav.fairplay')}
          </Text>
          <Text variant="title">{name}</Text>
          {f.player && <PlayerBadges p={f.player} />}
          {f.case && (
            <Row gap="xs" wrap>
              <Badge label={tr(`admin.fairplay.tabs.${f.case.status}`)} tone={f.case.status === 'open' ? 'warning' : f.case.status === 'banned' ? 'danger' : 'neutral'} />
              {f.case.reasons.map((r) => (
                <Badge key={r} label={translateOr(`admin.fairplay.reasons.${r}`, r)} tone="outline" />
              ))}
            </Row>
          )}
        </Stack>
        {f.case && (
          <Stack gap="xs" align="flex-end">
            <Text variant="overline" tone="tertiary">
              {tr('admin.fairplay.score')}
            </Text>
            <ScoreMeter score={f.case.score} width={140} />
          </Stack>
        )}
      </Row>

      {!f.analysisEnabled && (
        <Text variant="caption" tone="muted">
          {tr('admin.fairplay.analysisOff')}
        </Text>
      )}

      <Section title={tr('admin.fairplay.verdict')} index={1}>
        <Stack gap="md">
          {f.ban && (
            <Stack gap="xs">
              <Text>{tr('admin.fairplay.bannedBy', { by: f.ban.by, when: formatDateTime(f.ban.bannedAt) })}</Text>
              <Text tone="muted">{f.ban.reason}</Text>
              {f.ban.refunds.length > 0 && (
                <Stack gap="xxs">
                  <Text variant="label">{tr('admin.fairplay.refunds', { count: f.ban.refunds.length })}</Text>
                  {f.ban.refunds.map((r) => (
                    <Text key={`${r.gameId}-${r.playerId}`} variant="mono" tone="muted">
                      {tr('admin.fairplay.refundLine', { points: r.points, category: r.category, game: r.gameId })}
                    </Text>
                  ))}
                </Stack>
              )}
            </Stack>
          )}
          <Row gap="sm" wrap>
            {f.case?.status === 'open' && can('fairplay.review') && <Button size="sm" variant="secondary" title={tr('admin.fairplay.dismiss')} onPress={() => setDialog('dismiss')} />}
            {!closed && can('fairplay.ban') && f.player && f.player.role === 'user' && <Button size="sm" variant="danger" title={tr('admin.fairplay.ban')} onPress={() => setDialog('ban')} />}
            {(!f.case || f.case.status === 'dismissed') && !closed && can('fairplay.review') && <Button size="sm" variant="secondary" title={tr('admin.fairplay.open')} onPress={() => setDialog('open')} />}
            {can('fairplay.ban') && <Button size="sm" variant="secondary" title={tr('admin.fairplay.refundOpponents')} onPress={() => setDialog('refund')} />}
            {f.player && <Button size="sm" variant="ghost" title={tr('admin.reports.openPlayer')} onPress={() => router.push(`/admin/players/${encodeURIComponent(f.player!.id)}`)} />}
          </Row>
          {refunded && (
            <Text variant="caption" tone="muted">
              {refunded.players === 0 ? tr('admin.fairplay.refundNone') : tr('admin.fairplay.refundDone', { count: refunded.players, points: Math.round(refunded.points * 10) / 10 })}
            </Text>
          )}
        </Stack>
      </Section>

      {a && (
        <Section title={tr('admin.fairplay.score')} index={2} padding="none">
          <Stack gap="sm" style={{ padding: 10 }}>
            <TileGrid>
              <StatTile label={tr('admin.fairplay.accuracyZ')} value={a.accuracyZ.toFixed(2)} tone={a.accuracyZ >= 3 ? 'danger' : undefined} />
              <StatTile label={tr('admin.fairplay.matchZ')} value={a.matchZ.toFixed(2)} tone={a.matchZ >= 2.5 ? 'danger' : undefined} />
              <StatTile label={tr('admin.fairplay.timing')} value={a.mechanicalTimingGames} hint={tr('admin.fairplay.games', { count: a.games })} />
              <StatTile label={tr('admin.games.moves')} value={a.moves} />
            </TileGrid>
            <Text variant="caption" tone="muted" style={{ paddingHorizontal: 6 }}>
              {tr('admin.fairplay.explain')}
            </Text>
          </Stack>
        </Section>
      )}

      {can('fairplay.review') && (
        <Section title={tr('admin.fairplay.recentGames')} index={3} padding="none">
          <Stack gap="xs" style={{ padding: 10 }}>
            <Row gap="sm" align="center" wrap>
              <Button
                size="sm"
                variant="secondary"
                disabled={scan.running || !canAnalyzeHere() || !scan.list?.some((g) => !g.analyzed)}
                title={scan.running ? tr('admin.fairplay.analysing') : tr('admin.fairplay.analyseAll')}
                onPress={() => scan.run()}
              />
              {scan.running && <Button size="sm" variant="ghost" title={tr('admin.common.cancel')} onPress={scan.cancel} />}
              {scan.running && (
                <Text variant="caption" tone="muted">
                  {tr('admin.fairplay.analysingProgress', {
                    game: Math.min(scan.games.done + 1, Math.max(scan.games.total, 1)),
                    games: scan.games.total,
                    done: scan.positions.done,
                    total: scan.positions.total,
                  })}
                </Text>
              )}
            </Row>
            <Text variant="caption" tone="tertiary">
              {canAnalyzeHere() ? tr('admin.fairplay.analyseHereHint') : tr('admin.fairplay.analyseNoEngine')}
            </Text>
            {!scan.running && scan.outcome?.kind === 'none' && (
              <Text variant="caption" tone="muted">
                {tr('admin.fairplay.analyseAllDone')}
              </Text>
            )}
            {!scan.running && scan.outcome?.kind === 'done' && (
              <Text variant="caption" tone="muted">
                {scan.outcome.measured > 0
                  ? tr('admin.fairplay.analyseDone', { count: scan.outcome.analyzed })
                  : tr('admin.fairplay.analyseNothingMeasured', { count: scan.outcome.analyzed })}
              </Text>
            )}
            {!scan.running && scan.outcome?.kind === 'cancelled' && (
              <Text variant="caption" tone="muted">
                {tr('admin.fairplay.analyseStopped', { count: scan.outcome.analyzed })}
              </Text>
            )}
            {(scan.error || scan.listError) && (
              <Text variant="caption" tone="danger">
                {tr('admin.fairplay.analyseFailed', { message: scan.error ?? scan.listError ?? '' })}
              </Text>
            )}
          </Stack>
          {scan.list === null ? (
            <Text tone="muted" style={{ padding: 10 }}>
              {tr('admin.common.loading')}
            </Text>
          ) : scan.list.length === 0 ? (
            <EmptyState icon="game-controller-outline" title={tr('admin.fairplay.analyseNoGames')} />
          ) : (
            scan.list.map((g, i) => (
              <GameRow
                key={g.gameId}
                g={g}
                playerId={String(id)}
                last={i === scan.list!.length - 1}
                busy={scan.running}
                active={scan.current === g.gameId}
                onAnalyse={() => scan.run([g.gameId])}
              />
            ))
          )}
        </Section>
      )}

      <Section title={tr('admin.fairplay.evidence')} index={4} padding="none">
        {f.reports.length === 0 ? <EmptyState icon="analytics-outline" title={tr('admin.fairplay.noEvidence')} /> : f.reports.map((r, i) => <EvidenceRow key={`${r.gameId}${r.color}`} r={r} last={i === f.reports.length - 1} />)}
      </Section>

      <Section title={tr('admin.fairplay.log')} index={5}>
        {f.log.length === 0 ? (
          <Text tone="muted">{tr('admin.common.none')}</Text>
        ) : (
          <Stack gap="sm">
            {[...f.log].reverse().map((e, i) => (
              <Row key={i} gap="sm" align="flex-start">
                <Text variant="caption" tone="tertiary" style={{ width: 140 }}>
                  {formatDateTime(e.at)}
                </Text>
                <Text style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{translateOr(`admin.fairplay.logActions.${e.action}`, e.action)}</Text>
                  {` · ${e.by}${e.note ? ` · ${e.note}` : ''}`}
                </Text>
              </Row>
            ))}
          </Stack>
        )}
      </Section>

      {dialog === 'dismiss' && (
        <ActionDialog visible onClose={() => setDialog(null)} title={tr('admin.dialogs.dismissTitle')} description={tr('admin.dialogs.dismissBody')} confirmLabel={tr('admin.fairplay.dismiss')} onConfirm={() => done(() => api.dismissCase(String(id), note))}>
          <ReasonField value={note} onChange={setNote} multiline />
        </ActionDialog>
      )}
      {dialog === 'ban' && (
        <ActionDialog visible danger onClose={() => setDialog(null)} title={tr('admin.dialogs.banTitle', { name })} description={tr('admin.dialogs.banBody')} confirmLabel={tr('admin.fairplay.ban')} onConfirm={() => done(() => api.banFairPlay(String(id), note))}>
          <ReasonField value={note} onChange={setNote} multiline />
        </ActionDialog>
      )}
      {dialog === 'refund' && (
        <ActionDialog
          visible
          onClose={() => setDialog(null)}
          title={tr('admin.dialogs.refundTitle')}
          description={tr('admin.dialogs.refundBody')}
          confirmLabel={tr('admin.fairplay.refundOpponents')}
          onConfirm={() =>
            done(async () => {
              const r = await api.refundFairPlay(String(id), refundGames, note);
              setRefunded({ players: r.players, points: r.refunds.reduce((n, x) => n + x.points, 0) });
            })
          }
        >
          <Stack gap="xs">
            <Text variant="label">{tr('admin.fairplay.refundHowMany')}</Text>
            <Row gap="xs" wrap>
              {REFUND_CHOICES.map((n) => (
                <Button key={n} size="sm" variant={n === refundGames ? 'primary' : 'secondary'} title={String(n)} onPress={() => setRefundGames(n)} />
              ))}
            </Row>
            <ReasonField value={note} onChange={setNote} multiline />
          </Stack>
        </ActionDialog>
      )}
      {dialog === 'open' && (
        <ActionDialog visible onClose={() => setDialog(null)} title={tr('admin.dialogs.reviewTitle')} description={tr('admin.dialogs.reviewBody')} confirmLabel={tr('admin.fairplay.open')} onConfirm={() => done(() => api.openCase(String(id), note))}>
          <ReasonField value={note} onChange={setNote} multiline />
        </ActionDialog>
      )}
    </AdminPage>
  );
}

/** Measured vs expected for one analysed game: the bar is the player, the tick is what their rating predicts. */
function Compare({ label, value, expected, format, max }: { label: string; value: number; expected: number; format: (n: number) => string; max: number }) {
  const { colors: c } = useAppTheme();
  const tr = useT();
  const over = value > expected * 1.15;
  return (
    <Stack gap="xxs" style={{ flex: 1, minWidth: 150 }}>
      <Row justify="space-between">
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="numeric">{format(value)}</Text>
      </Row>
      <View style={[styles.track, { backgroundColor: c.border, direction: 'ltr' } as never]}>
        <View style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: over ? c.warning : c.text }} />
        <View style={[styles.tick, { left: `${Math.min(100, (expected / max) * 100)}%`, backgroundColor: c.muted }]} />
      </View>
      <Text variant="caption" tone="tertiary">
        {tr('admin.fairplay.expected', { value: format(expected) })}
      </Text>
    </Stack>
  );
}

/** One of the account's recent games, with what the engine has made of it so far. */
function GameRow({
  g,
  playerId,
  last,
  busy,
  active,
  onAnalyse,
}: {
  g: AdminFairPlayGame;
  playerId: string;
  last: boolean;
  busy: boolean;
  active: boolean;
  onAnalyse: () => void;
}) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  const color = g.white.id === playerId ? 'w' : 'b';
  const opponent = color === 'w' ? g.black : g.white;
  return (
    <Row
      gap="sm"
      justify="space-between"
      align="center"
      wrap
      style={[styles.ev, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}
    >
      <Stack gap="xxs" style={{ flex: 1, minWidth: 200 }}>
        <Row gap="sm" align="center" wrap>
          <Badge label={color === 'w' ? '♔' : '♚'} tone="outline" />
          <Text variant="label">{tr('admin.fairplay.gameVersus', { name: opponent.name })}</Text>
          {!g.rated && <Badge label={tr('admin.fairplay.unrated')} tone="neutral" />}
        </Row>
        <Text variant="caption" tone="tertiary">
          {`${tr('admin.fairplay.moves', { count: Math.ceil(g.moves.length / 2) })} · ${g.result} · ${formatAgo(g.endedAt)}`}
        </Text>
      </Stack>
      <Row gap="sm" align="center">
        {g.analyzed && (
          <Text variant="caption" tone="muted">
            {g.measuredMoves === 0 ? tr('admin.fairplay.nothingMeasured') : tr('admin.fairplay.measured', { count: g.measuredMoves ?? 0 })}
          </Text>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !canAnalyzeHere()}
          title={active ? tr('admin.fairplay.analysing') : g.analyzed ? tr('admin.fairplay.analyseAgain') : tr('admin.fairplay.analyseOne')}
          onPress={onAnalyse}
        />
        <Button size="sm" variant="ghost" title={tr('admin.common.view')} onPress={() => router.push(`/admin/games/${encodeURIComponent(g.gameId)}`)} />
      </Row>
    </Row>
  );
}

function EvidenceRow({ r, last }: { r: AdminEngineReport; last: boolean }) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  return (
    <Stack gap="sm" style={[styles.ev, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      <Row justify="space-between" wrap gap="sm">
        <Row gap="sm">
          <Badge label={r.color === 'w' ? '♔' : '♚'} tone="outline" />
          <Text variant="label">{`${tr('admin.reports.game', { id: r.gameId })} · ${Math.round(r.rating)}`}</Text>
          {r.source === 'device' && <Badge label={tr('admin.fairplay.fromDevice')} tone="outline" />}
        </Row>
        <Row gap="sm">
          <Text variant="caption" tone="tertiary">
            {`${tr('admin.fairplay.moves', { count: r.moves })} · ${formatAgo(r.analyzedAt)}`}
          </Text>
          <Button size="sm" variant="ghost" title={tr('admin.common.view')} onPress={() => router.push(`/admin/games/${encodeURIComponent(r.gameId)}`)} />
        </Row>
      </Row>
      <Row gap="lg" wrap align="flex-start">
        <Compare label={tr('admin.fairplay.accuracy')} value={r.accuracy} expected={r.expectedAccuracy} max={100} format={(n) => `${n.toFixed(1)}%`} />
        <Compare label={tr('admin.fairplay.topMatch')} value={r.matchRate * 100} expected={r.expectedMatchRate * 100} max={100} format={(n) => `${n.toFixed(0)}%`} />
        <Field label={tr('admin.fairplay.acpl')} value={r.acpl.toFixed(0)} />
        <Field label={tr('admin.fairplay.thinkCv')} value={`${r.thinkCv.toFixed(2)} · ${(r.meanThinkMs / 1000).toFixed(1)}s`} />
      </Row>
    </Stack>
  );
}

const styles = StyleSheet.create({
  ev: { paddingHorizontal: 16, paddingVertical: 14 },
  track: { height: 6, borderRadius: 3, overflow: 'visible', position: 'relative' },
  tick: { position: 'absolute', top: -3, width: 2, height: 12, borderRadius: 1, marginLeft: -1 },
});
