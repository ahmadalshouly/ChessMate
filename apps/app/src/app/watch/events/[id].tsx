import type { EventDetail, EventGameSummary } from '@chessmate/core';
import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useTicker } from '@/components/PlayerBar';
import { TitleBadge } from '@/features/titles/TitleBadge';
import { EventLogo, GameThumb, StatusPill, dateRange, openLink } from '@/features/watch/components';
import { formatAgo, formatDateTime, useT } from '@/i18n';
import { countryFlag } from '@/lib/leaderboardApi';
import { usePolled, watchApi } from '@/lib/watchApi';
import { Badge, Button, Chip, GlassView, Row, Screen, Skeleton, Stack, Tabs, Text, useAppTheme } from '@/ui';

type Tab = 'games' | 'standings' | 'players' | 'news' | 'about';
/** Rounds with more boards show the rest as a list, to keep the page light. */
const MAX_BOARDS = 24;

const score = (n: number) => (n % 1 ? `${Math.floor(n) || ''}½` : String(n));

export default function EventScreen() {
  const tr = useT();
  const t = useAppTheme();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => watchApi.event(String(id)), [id]);
  const { data: e, error, loading, refresh } = usePolled<EventDetail>(id ? load : null, { fastMs: 5_000, slowMs: 30_000, isLive: (d) => d.status === 'live' });
  const [tab, setTab] = useState<Tab>('games');
  const [roundId, setRoundId] = useState<string | null>(null);
  const round = e?.rounds.find((r) => r.id === (roundId ?? e.currentRound?.id)) ?? e?.rounds[e.rounds.length - 1];
  const games = useMemo(() => [...(round?.games ?? [])].sort((a, b) => a.board - b.board), [round]);
  const now = useTicker(games.some((g) => g.status === 'live'));
  const cols = width > 1100 ? 4 : width > 760 ? 3 : 2;
  const thumb = Math.floor((Math.min(width, 1200) - 48 - (cols - 1) * 20) / cols);

  if (!e) {
    return (
      <Screen scroll width="wide">
        <RouterStack.Screen options={{ title: tr('watch.event') }} />
        {error ? (
          <GlassView padding="lg" radius="lg" style={{ gap: t.space.md }}>
            <Text tone="muted">{tr('watch.loadFailed', { reason: error })}</Text>
            <Button title={tr('common.tryAgain')} variant="secondary" onPress={() => void refresh()} />
          </GlassView>
        ) : (
          loading && <Skeleton height={160} radius="lg" />
        )}
      </Screen>
    );
  }

  return (
    <Screen scroll width="wide">
      <RouterStack.Screen options={{ title: e.name }} />
      <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
        <Row gap="md">
          <EventLogo path={e.logoPath} name={e.name} size={64} />
          <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
            <StatusPill status={e.status} />
            <Text variant="title">{e.name}</Text>
            <Text variant="caption" tone="muted">
              {[dateRange(e.startsAt, e.endsAt), e.location, e.timeControl].filter(Boolean).join(' · ')}
            </Text>
          </Stack>
        </Row>
        {e.shortDescription ? <Text tone="muted">{e.shortDescription}</Text> : null}
        <Row gap="sm" wrap>
          {!e.published && <Badge label={tr('watch.draft')} tone="warning" />}
          {e.hidden && <Badge label={tr('watch.hidden')} tone="danger" />}
          {e.canManage && <Button title={tr('watch.manage.open')} variant="secondary" size="sm" onPress={() => router.push(`/watch/manage/${e.id}`)} />}
          {e.source === 'lichess' && e.sourceUrl && <Button title={tr('watch.sourceLichess')} variant="ghost" size="sm" onPress={() => openLink(e.sourceUrl!)} />}
        </Row>
      </GlassView>

      <Tabs
        items={(['games', 'standings', 'players', 'news', 'about'] as Tab[]).map((k) => ({ key: k, label: k === 'news' && e.news.length ? `${tr('watch.tabs.news')} (${e.news.length})` : tr(`watch.tabs.${k}`) }))}
        value={tab}
        onChange={setTab}
      />

      {tab === 'games' &&
        (e.rounds.length === 0 ? (
          <Empty text={tr('watch.noRounds')} />
        ) : (
          <Stack gap="md">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space.sm }}>
              {e.rounds.map((r) => (
                <Chip key={r.id} label={r.status === 'live' ? `● ${r.name}` : r.name} selected={r.id === round?.id} onPress={() => setRoundId(r.id)} />
              ))}
            </ScrollView>
            {round && (
              <Text variant="caption" tone="muted">
                {[tr(`watch.status.${round.status}`), round.startsAt ? formatDateTime(round.startsAt) : null, tr('watch.boards', { count: games.length })].filter(Boolean).join(' · ')}
              </Text>
            )}
            {games.length === 0 ? (
              <Empty text={tr('watch.noGamesYet')} />
            ) : (
              <>
                <View style={[styles.grid, { gap: 20 }]}>
                  {games.slice(0, MAX_BOARDS).map((g) => (
                    <GameThumb key={g.id} g={g} size={thumb} now={now} />
                  ))}
                </View>
                {games.length > MAX_BOARDS && (
                  <GlassView radius="lg" padding="none">
                    {games.slice(MAX_BOARDS).map((g, i) => (
                      <GameRow key={g.id} g={g} last={i === games.length - MAX_BOARDS - 1} />
                    ))}
                  </GlassView>
                )}
              </>
            )}
          </Stack>
        ))}

      {tab === 'standings' &&
        (e.standings.length === 0 ? (
          <Empty text={tr('watch.noStandings')} />
        ) : (
          <GlassView radius="lg" padding="none">
            <Row gap="sm" style={[styles.row, { borderBottomColor: t.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <Text variant="overline" tone="muted" style={styles.rank}>
                #
              </Text>
              <Text variant="overline" tone="muted" style={{ flex: 1 }}>
                {tr('watch.player')}
              </Text>
              <Text variant="overline" tone="muted" style={styles.num}>
                {tr('watch.pts')}
              </Text>
              {width > 500 && (
                <>
                  <Text variant="overline" tone="muted" style={styles.num}>
                    {tr('watch.games')}
                  </Text>
                  <Text variant="overline" tone="muted" style={styles.num}>
                    BH
                  </Text>
                  <Text variant="overline" tone="muted" style={styles.wide}>
                    {tr('watch.perf')}
                  </Text>
                </>
              )}
            </Row>
            {e.standings.map((s, i) => (
              <Row key={`${s.playerId ?? s.name}`} gap="sm" style={[styles.row, i < e.standings.length - 1 && { borderBottomColor: t.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <Text variant="numeric" tone="muted" style={styles.rank}>
                  {s.rank}
                </Text>
                <Row gap="xs" style={{ flex: 1, minWidth: 0 }}>
                  {s.federation ? <Text>{countryFlag(s.federation)}</Text> : null}
                  <TitleBadge title={s.title} size="sm" />
                  <Text numberOfLines={1} style={{ flexShrink: 1 }}>
                    {s.name}
                  </Text>
                  {s.rating ? (
                    <Text variant="caption" tone="muted">
                      {s.rating}
                    </Text>
                  ) : null}
                </Row>
                <Text variant="numeric" style={styles.num}>
                  {score(s.points)}
                </Text>
                {width > 500 && (
                  <>
                    <Text variant="numeric" tone="muted" style={styles.num}>
                      {s.games}
                    </Text>
                    <Text variant="numeric" tone="muted" style={styles.num}>
                      {score(s.buchholz)}
                    </Text>
                    <Text variant="numeric" tone="muted" style={styles.wide}>
                      {s.performance ?? '–'}
                    </Text>
                  </>
                )}
              </Row>
            ))}
          </GlassView>
        ))}

      {tab === 'players' &&
        (e.players.length === 0 ? (
          <Empty text={tr('watch.noPlayers')} />
        ) : (
          <GlassView radius="lg" padding="none">
            {e.players.map((p, i) => (
              <Pressable
                key={p.id}
                disabled={!p.username}
                accessibilityRole={p.username ? 'link' : undefined}
                onPress={() => p.username && router.push(`/profile/${encodeURIComponent(p.username)}`)}
                style={[styles.row, i < e.players.length - 1 && { borderBottomColor: t.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <Row gap="xs" style={{ flex: 1, minWidth: 0 }}>
                  {p.federation ? <Text>{countryFlag(p.federation)}</Text> : null}
                  <TitleBadge title={p.title} size="sm" />
                  <Text numberOfLines={1} style={{ flexShrink: 1 }}>
                    {p.name}
                  </Text>
                  {p.username && <Badge label={`@${p.username}`} size="sm" />}
                </Row>
                <Text variant="numeric" tone="muted">
                  {[p.rating, p.fideId ? `FIDE ${p.fideId}` : null].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
            ))}
          </GlassView>
        ))}

      {tab === 'news' &&
        (e.news.length === 0 ? (
          <Empty text={tr('watch.noNews')} />
        ) : (
          <Stack gap="md">
            {e.news.map((n) => (
              <GlassView key={n.id} padding="lg" radius="lg" style={{ gap: t.space.xs }}>
                <Text variant="bodyStrong">{n.title}</Text>
                <Text variant="caption" tone="muted">
                  {[n.author?.displayName, formatAgo(n.createdAt)].filter(Boolean).join(' · ')}
                </Text>
                <Text selectable>{n.body}</Text>
              </GlassView>
            ))}
          </Stack>
        ))}

      {tab === 'about' && (
        <GlassView padding="lg" radius="lg" style={{ gap: t.space.md }}>
          {e.description ? <Text selectable>{e.description}</Text> : <Text tone="muted">{tr('watch.noDescription')}</Text>}
          <Stack gap="xs">
            <Fact label={tr('watch.fields.format')} value={tr(`watch.formats.${e.format}`)} />
            {e.timeControl ? <Fact label={tr('watch.fields.timeControl')} value={e.timeControl} /> : null}
            <Fact label={tr('watch.fields.dates')} value={dateRange(e.startsAt, e.endsAt)} />
            {e.location ? <Fact label={tr('watch.fields.location')} value={e.location} /> : null}
            <Fact label={tr('watch.fields.rounds')} value={String(e.roundCount)} />
          </Stack>
          {e.website && <Button title={tr('watch.website')} variant="secondary" onPress={() => openLink(e.website!)} />}
          {e.source === 'lichess' && (
            <Text variant="caption" tone="muted">
              {tr('watch.lichessCredit')}
            </Text>
          )}
        </GlassView>
      )}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Row gap="sm">
      <Text variant="label" tone="muted" style={{ minWidth: 110 }}>
        {label}
      </Text>
      <Text style={{ flex: 1 }}>{value}</Text>
    </Row>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <GlassView padding="lg" radius="lg">
      <Text tone="muted">{text}</Text>
    </GlassView>
  );
}

function GameRow({ g, last }: { g: EventGameSummary; last: boolean }) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/watch/game/${g.id}`)}
      style={[styles.row, !last && { borderBottomColor: t.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text variant="numeric" tone="muted" style={styles.rank}>
        {g.board}
      </Text>
      <Text numberOfLines={1} style={{ flex: 1 }}>
        {g.white.name} – {g.black.name}
      </Text>
      <Text variant="numeric">{g.result === '*' ? (g.ply ? '…' : '') : g.result.replace('1/2', '½')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  rank: { width: 28 },
  num: { width: 40, textAlign: 'right' },
  wide: { width: 52, textAlign: 'right' },
});
