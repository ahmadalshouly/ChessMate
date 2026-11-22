import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { formatClock, type GameEnding, type GameResult, type MoveClass, type Square, type EventGameSummary, type EventStatus, type EventSummary, type StreamPlatform, type StreamerView } from '@chessmate/core';
import { router } from 'expo-router';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Board } from '@/components/Board';
import { EvalBar } from '@/components/EvalBar';
import { BoardMoveBadge } from '@/components/MoveBadge';
import { PostImage, pictureUri } from '@/features/media/MediaFields';
import { TitleBadge } from '@/features/titles/TitleBadge';
import { formatDate, formatNumber, useT } from '@/i18n';
import { countryFlag } from '@/lib/leaderboardApi';
import { eventLogoUri } from '@/lib/watchApi';
import { Avatar, Badge, Button, GlassView, Row, Stack, Text, useAppTheme } from '@/ui';

export const PLATFORM_ICON: Record<StreamPlatform, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  twitch: 'twitch',
  youtube: 'youtube',
  kick: 'alpha-k-box',
  other: 'web',
};

export const openLink = (url: string) => void Linking.openURL(url).catch(() => {});

/** "12 – 20 Jan 2026" */
export function dateRange(a: number, b: number): string {
  const same = new Date(a).toDateString() === new Date(b).toDateString();
  const d = (ms: number) => formatDate(ms, { day: 'numeric', month: 'short' });
  return same ? formatDate(a, { day: 'numeric', month: 'short', year: 'numeric' }) : `${d(a)} – ${formatDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function LiveDot({ size = 8 }: { size?: number }) {
  const c = useAppTheme().colors;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.danger }} />;
}

export function StatusPill({ status }: { status: EventStatus }) {
  const tr = useT();
  if (status === 'live')
    return (
      <Row gap="xs" accessible accessibilityLabel={tr('watch.status.live')}>
        <LiveDot />
        <Text variant="overline" tone="danger">
          {tr('watch.status.live')}
        </Text>
      </Row>
    );
  return <Badge label={tr(`watch.status.${status}`)} tone={status === 'upcoming' ? 'outline' : 'neutral'} size="sm" />;
}

export function EventLogo({ path, name, size = 48 }: { path: string | null; name: string; size?: number }) {
  const c = useAppTheme().colors;
  const uri = eventLogoUri(path);
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: c.surfaceSunken }} resizeMode="cover" accessibilityLabel={name} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: c.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name="chess-rook" size={size * 0.5} color={c.muted} />
    </View>
  );
}

/** An event in a list: logo, name, status, dates and place. */
export function EventCard({ e, onPress, compact }: { e: EventSummary; onPress?: () => void; compact?: boolean }) {
  const tr = useT();
  const t = useAppTheme();
  const open = onPress ?? (() => router.push(`/watch/events/${e.id}`));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={e.name} onPress={open} style={compact ? { width: 280 } : undefined}>
      {({ pressed }) => (
        <GlassView padding="md" radius="lg" style={{ gap: t.space.sm, opacity: pressed ? 0.85 : 1 }}>
          {!compact && e.coverPath ? <PostImage uri={pictureUri(e.coverPath)!} maxHeight={180} /> : null}
          <Row gap="md">
            <EventLogo path={e.logoPath} name={e.name} />
            <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
              <Row gap="xs">
                <StatusPill status={e.status} />
                {e.featured && <MaterialCommunityIcons name="star" size={14} color={t.colors.warning} accessibilityLabel={tr('watch.featured')} />}
              </Row>
              <Text variant="bodyStrong" numberOfLines={2}>
                {e.name}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {[dateRange(e.startsAt, e.endsAt), e.location].filter(Boolean).join(' · ')}
              </Text>
            </Stack>
          </Row>
          {!compact && e.shortDescription ? (
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {e.shortDescription}
            </Text>
          ) : null}
          <Row gap="sm" wrap>
            {e.status === 'live' && e.liveGames > 0 && <Badge label={tr('watch.liveGames', { count: e.liveGames })} tone="danger" size="sm" />}
            {e.currentRound && <Badge label={e.currentRound.name} size="sm" />}
            {e.playerCount > 0 && <Badge label={tr('watch.players', { count: e.playerCount })} size="sm" />}
            {e.timeControl ? <Badge label={e.timeControl} size="sm" /> : null}
            {!e.published && <Badge label={tr('watch.draft')} tone="warning" size="sm" />}
            {e.hidden && <Badge label={tr('watch.hidden')} tone="danger" size="sm" />}
            {e.source === 'lichess' && <Badge label={tr('watch.viaLichess')} size="sm" />}
          </Row>
        </GlassView>
      )}
    </Pressable>
  );
}

/** A streamer: name, headline, live title and a button to watch. */
export function StreamerCard({ s, compact }: { s: StreamerView; compact?: boolean }) {
  const tr = useT();
  const t = useAppTheme();
  const c = t.colors;
  return (
    <GlassView padding="md" radius="lg" style={[{ gap: t.space.sm }, compact && { width: 260 }]}>
      <Pressable accessibilityRole="button" onPress={() => router.push(`/profile/${encodeURIComponent(s.username)}`)}>
        <Row gap="md">
          <View>
            <Avatar name={s.displayName} size={44} />
            {s.live && (
              <View style={[styles.liveTag, { backgroundColor: c.danger }]}>
                <Text variant="overline" style={{ color: '#fff', fontSize: 9 }}>
                  {tr('watch.status.live')}
                </Text>
              </View>
            )}
          </View>
          <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
            <Row gap="xs">
              <TitleBadge title={s.title} size="sm" />
              <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                {s.displayName}
              </Text>
              {s.country ? <Text>{countryFlag(s.country)}</Text> : null}
            </Row>
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {s.live?.title || s.headline || `@${s.username}`}
            </Text>
          </Stack>
        </Row>
      </Pressable>
      <Row gap="sm" justify="space-between">
        <Row gap="sm">
          {s.channels.map((ch) => (
            <Pressable key={ch.url} accessibilityRole="link" accessibilityLabel={ch.platform} hitSlop={6} onPress={() => openLink(ch.url)}>
              <MaterialCommunityIcons name={PLATFORM_ICON[ch.platform]} size={22} color={c.muted} />
            </Pressable>
          ))}
        </Row>
        {s.live && (
          <Row gap="sm">
            {s.live.viewers !== null ? (
              <Row gap="xxs" accessibilityLabel={tr('watch.viewers', { count: formatNumber(s.live.viewers) })}>
                <MaterialCommunityIcons name="eye-outline" size={15} color={c.muted} />
                <Text variant="caption" tone="muted">
                  {formatNumber(s.live.viewers)}
                </Text>
              </Row>
            ) : null}
            <Button title={tr('watch.watchStream')} size="sm" leftIcon={<MaterialCommunityIcons name="play" size={16} color={c.textInverse} />} onPress={() => openLink(s.live!.url)} />
          </Row>
        )}
      </Row>
    </GlassView>
  );
}

/** Remaining time of a running clock, counted from when the server read it. */
export function clockNow(ms: number | null, at: number | null, running: boolean, now: number): number | null {
  if (ms === null) return null;
  return running && at ? Math.max(0, ms - (now - at)) : ms;
}

const ENDING_ICON: Record<GameEnding, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  checkmate: 'chess-king',
  resign: 'flag-variant',
  timeout: 'timer-sand-complete',
  stalemate: 'equal',
  repetition: 'repeat',
  insufficient: 'equal',
  fiftyMove: 'equal',
  agreement: 'handshake-outline',
  forfeit: 'flag-variant-outline',
};

/** How a finished game ended, in words ("Black resigned", "Draw agreed"). */
export function endingText(ending: GameEnding, result: GameResult, tr: ReturnType<typeof useT>): string {
  const loser = result === '1-0' ? tr('play.black') : tr('play.white');
  return tr(`watch.ending.${ending}`, { side: loser });
}

/** A small label on a finished board saying how the game ended. */
export function EndingPill({ ending, result }: { ending: GameEnding; result: GameResult }) {
  const tr = useT();
  return (
    <View style={styles.endingPill} pointerEvents="none">
      <MaterialCommunityIcons name={ENDING_ICON[ending]} size={12} color="#fff" />
      <Text variant="caption" style={{ color: '#fff', fontSize: 11 }} numberOfLines={1}>
        {endingText(ending, result, tr)}
      </Text>
    </View>
  );
}

/** Move grades worth pointing out on live boards. */
export const SHOWN_GRADES = new Set<MoveClass>(['masterpiece', 'brilliant', 'great', 'blunder']);

/** A game of an event as a small board with names, clocks, evaluation and result. */
export function GameThumb({ g, size, now }: { g: EventGameSummary; size: number; now: number }) {
  const t = useAppTheme();
  const toMove = g.fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const live = g.status === 'live';
  // A slim evaluation bar beside the board.
  const BAR = 6;
  const BAR_GAP = 3;
  const board = size - BAR - BAR_GAP;
  const last = g.lastMove ? { from: g.lastMove.slice(0, 2) as never, to: g.lastMove.slice(2, 4) as never } : null;
  const side = (color: 'w' | 'b') => {
    const p = color === 'w' ? g.white : g.black;
    const ms = clockNow(color === 'w' ? g.whiteClockMs : g.blackClockMs, g.clockAt, live && toMove === color, now);
    const score = g.result === '*' ? null : g.result === '1/2-1/2' ? '½' : (g.result === '1-0') === (color === 'w') ? '1' : '0';
    return (
      <Row gap="xs" justify="space-between" style={{ width: size }}>
        <Row gap="xxs" style={{ flex: 1, minWidth: 0 }}>
          {p.federation ? <Text variant="caption">{countryFlag(p.federation)}</Text> : null}
          <TitleBadge title={p.title} size="sm" />
          <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
            {p.name}
          </Text>
          {p.rating ? (
            <Text variant="caption" tone="muted">
              {p.rating}
            </Text>
          ) : null}
        </Row>
        {score !== null ? (
          <Text variant="label">{score}</Text>
        ) : ms !== null ? (
          <Text variant="numeric" tone={live && toMove === color ? 'default' : 'muted'} style={{ fontSize: 12 }}>
            {formatClock(ms)}
          </Text>
        ) : null}
      </Row>
    );
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${g.white.name} – ${g.black.name}`} onPress={() => router.push(`/watch/game/${g.id}`)}>
      {({ pressed }) => (
        <View style={{ gap: 4, opacity: pressed ? 0.85 : 1 }}>
          {side('b')}
          <View style={{ flexDirection: 'row', gap: BAR_GAP }}>
            <EvalBar score={g.evalScore} orientation="w" height={board} width={BAR} />
            <View style={{ width: board, height: board, borderRadius: t.radii.sm, overflow: 'hidden' }}>
              <Board fen={g.fen} orientation="w" size={board} lastMove={last} hideCoordinates />
              {g.lastGrade && SHOWN_GRADES.has(g.lastGrade) && g.lastMove ? <BoardMoveBadge square={g.lastMove.slice(2, 4) as Square} cls={g.lastGrade} size={board} orientation="w" /> : null}
              {g.ending ? <EndingPill ending={g.ending} result={g.result} /> : null}
            </View>
          </View>
          {side('w')}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  liveTag: { position: 'absolute', bottom: -4, left: 4, right: 4, borderRadius: 4, alignItems: 'center', paddingVertical: 1 },
  endingPill: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    maxWidth: '92%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
});
