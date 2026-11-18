import {
  formatTimeControl,
  isOnFire,
  prizeTotal,
  timeCategory,
  type AwardedPrize,
  type PrizePool,
  type TournamentPairing,
  type TournamentStanding,
  type TournamentSummary,
} from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { dirIcon, formatDate, formatNumber, translate, useI18n, useT } from '@/i18n';
import { useNow } from '@/lib/tournamentsApi';
import { Badge, GlassView, Row, Stack, Text, useAppTheme, type BadgeTone } from '@/ui';

/** "2h 5m" style countdown. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return translate('tournaments.time.d', { d, h });
  if (h > 0) return translate('tournaments.time.h', { h, m });
  if (m > 0) return translate('tournaments.time.m', { m, s: sec });
  return translate('tournaments.time.s', { s: sec });
}

export function formatMoney(amount: number, currency: string): string {
  return `${formatNumber(amount)} ${currency}`;
}

export function prizeText(p: Pick<AwardedPrize, 'amount' | 'currency' | 'label'>): string {
  if (p.amount === 0 && p.label) return p.label;
  return p.label ? `${formatMoney(p.amount, p.currency)} + ${p.label}` : formatMoney(p.amount, p.currency);
}

export function poolTotal(pool: PrizePool | null): string | null {
  if (!pool) return null;
  const total = prizeTotal(pool);
  return total > 0 ? formatMoney(total, pool.currency) : (pool.places[0]?.label ?? null);
}

export const STATUS_TONE: Record<TournamentSummary['status'], BadgeTone> = { scheduled: 'outline', running: 'live', finished: 'neutral', cancelled: 'danger' };

export function StatusBadge({ status }: { status: TournamentSummary['status'] }) {
  const tr = useT();
  return <Badge label={tr(`tournaments.status.${status}`)} tone={STATUS_TONE[status]} />;
}

/** "Arena · 3+2 · Blitz · Rated · 60 min" */
export function formatLine(t: Pick<TournamentSummary, 'format' | 'timeControl' | 'rated' | 'durationMinutes' | 'rounds'>): string {
  return [
    translate(`tournaments.format.${t.format}`),
    formatTimeControl(t.timeControl),
    translate(`common.category.${timeCategory(t.timeControl)}`),
    translate(t.rated ? 'tournaments.rated' : 'tournaments.casual'),
    t.format === 'arena' ? translate('tournaments.minutes', { count: t.durationMinutes ?? 0 }) : translate('tournaments.rounds', { count: t.rounds ?? 0 }),
  ].join(' · ');
}

export function ratingLimit(t: Pick<TournamentSummary, 'minRating' | 'maxRating'>): string | null {
  if (t.minRating !== null && t.maxRating !== null) return translate('tournaments.ratingRange', { min: t.minRating, max: t.maxRating });
  if (t.minRating !== null) return translate('tournaments.ratingMin', { min: t.minRating });
  if (t.maxRating !== null) return translate('tournaments.ratingMax', { max: t.maxRating });
  return null;
}

/** Where the tournament is in time: starts in, ends in, round x of y, winner. */
export function timeLine(t: TournamentSummary & { nextRoundAt?: number | null }, now: number): string {
  switch (t.status) {
    case 'scheduled':
      return t.startsAt - now > 0 ? (t.startsAt - now < 86_400_000 ? translate('tournaments.startsIn', { time: countdown(t.startsAt - now) }) : translate('tournaments.startsAt', { when: formatDate(t.startsAt, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })) : translate('tournaments.starting');
    case 'running':
      if (t.format === 'swiss') {
        const r = translate('tournaments.round', { round: t.currentRound, rounds: t.rounds ?? 0 });
        return t.nextRoundAt ? `${r} · ${translate('tournaments.nextRound', { time: countdown(t.nextRoundAt - now) })}` : r;
      }
      return t.endsAt && t.endsAt > now ? translate('tournaments.endsIn', { time: countdown(t.endsAt - now) }) : translate('tournaments.wrapping');
    default:
      return t.winner ? translate('tournaments.winner', { name: t.winner.username }) : translate('tournaments.ended', { when: formatDate(t.endedAt ?? t.startsAt, { day: 'numeric', month: 'short' }) });
  }
}

/** A tournament in a list. */
export function TournamentCard({ t, footer, onPress }: { t: TournamentSummary; footer?: ReactNode; onPress?: () => void }) {
  const theme = useAppTheme();
  const c = theme.colors;
  const tr = useT();
  const live = t.status === 'running';
  const now = useNow(t.status === 'scheduled' || live);
  const pool = poolTotal(t.prizePool);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={t.name} onPress={onPress ?? (() => router.push({ pathname: '/tournaments/[id]', params: { id: t.id } }))}>
      {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
        <GlassView radius="xl" padding="lg" elevation={hovered ? 'lg' : 'md'} style={[styles.card, { transform: [{ scale: pressed ? 0.988 : 1 }, { translateY: hovered ? -2 : 0 }] }]}>
          <View style={styles.cardTop}>
            <FormatMark format={t.format} live={live} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text variant="subheading" numberOfLines={1}>
                {t.name}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {formatLine(t)}
              </Text>
            </View>
            <StatusBadge status={t.status} />
          </View>
          <View style={[styles.cardFoot, { borderTopColor: c.border }]}>
            <Meta icon="time-outline" text={timeLine(t, now)} strong={live} />
            <Meta icon="people-outline" text={t.maxPlayers ? tr('tournaments.playersOf', { count: t.players, max: t.maxPlayers }) : tr('tournaments.players', { count: t.players })} />
            {pool && <Meta icon="trophy-outline" text={tr('tournaments.prizePoolTotal', { amount: pool })} strong />}
            {t.joined && <Badge label={tr('tournaments.joined')} tone="solid" icon={<Ionicons name="checkmark" size={11} color={c.onAccent} />} />}
            {footer}
          </View>
        </GlassView>
      )}
    </Pressable>
  );
}

export function FormatMark({ format, live, size = 42 }: { format: TournamentSummary['format']; live?: boolean; size?: number }) {
  const c = useAppTheme().colors;
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size / 2, borderColor: c.borderStrong, backgroundColor: live ? c.accent : 'transparent' }]}>
      <MaterialCommunityIcons name={format === 'arena' ? 'sword-cross' : 'tournament'} size={size * 0.45} color={live ? c.onAccent : c.text} />
    </View>
  );
}

export function Meta({ icon, text, strong }: { icon: keyof typeof Ionicons.glyphMap; text: string; strong?: boolean }) {
  const c = useAppTheme().colors;
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={13} color={strong ? c.text : c.muted} />
      <Text variant="caption" tone={strong ? 'default' : 'muted'} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** The prize ladder: places, amounts and extras, plus the payout state once awarded. */
export function PrizeLadder({ pool, winners }: { pool: PrizePool | null; winners?: TournamentStanding[] }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  if (!pool) return <Text tone="muted">{tr('tournaments.prize.none')}</Text>;
  return (
    <Stack gap="sm">
      {pool.places.map((p) => {
        const w = winners?.find((s) => s.prize?.place === p.place);
        return (
          <View key={p.place} style={[styles.prize, { borderColor: c.border, backgroundColor: p.place === 1 ? c.surfaceStrong : c.surfaceSubtle }]}>
            <PlaceMark place={p.place} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="bodyStrong">{p.amount > 0 ? formatMoney(p.amount, pool.currency) : p.label}</Text>
              {p.amount > 0 && p.label ? (
                <Text variant="caption" tone="muted">
                  + {p.label}
                </Text>
              ) : null}
            </View>
            {w && (
              <Row gap="xs">
                <Text variant="label" numberOfLines={1}>
                  {w.username}
                </Text>
                <Badge label={w.prize!.paidAt ? tr('tournaments.prize.paid') : tr('tournaments.prize.pending')} tone={w.prize!.paidAt ? 'success' : 'outline'} />
              </Row>
            )}
          </View>
        );
      })}
      <Row justify="space-between" wrap>
        <Text variant="overline" tone="tertiary">
          {tr('tournaments.admin.form.total', { amount: formatMoney(prizeTotal(pool), pool.currency) })}
        </Text>
      </Row>
      {pool.note ? <Text tone="muted">{pool.note}</Text> : null}
      <Text variant="caption" tone="tertiary">
        {tr('tournaments.prize.note')}
      </Text>
    </Stack>
  );
}

export function PlaceMark({ place }: { place: number }) {
  const c = useAppTheme().colors;
  const top = place <= 3;
  return (
    <View style={[styles.place, { borderColor: top ? c.text : c.borderStrong, backgroundColor: place === 1 ? c.accent : 'transparent' }]}>
      {top ? (
        <MaterialCommunityIcons name={place === 1 ? 'crown' : 'medal-outline'} size={15} color={place === 1 ? c.onAccent : c.text} />
      ) : (
        <Text variant="figure" style={{ fontSize: 12 }}>
          {place}
        </Text>
      )}
    </View>
  );
}

/**
 * Standings table. `me` highlights the viewer; `renderActions` adds staff
 * controls to each row.
 */
export function Standings({ rows, format, me, renderActions, max }: { rows: TournamentStanding[]; format: TournamentSummary['format']; me?: string | null; renderActions?: (s: TournamentStanding) => ReactNode; max?: number }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  if (rows.length === 0) return <Text tone="muted" style={{ padding: 16 }}>{tr('tournaments.standings.empty')}</Text>;
  const shown = max ? rows.slice(0, max) : rows;
  return (
    <View>
      <View style={[styles.sRow, styles.sHead, { borderBottomColor: c.border }]}>
        <Text variant="overline" tone="tertiary" style={styles.sRank}>
          #
        </Text>
        <Text variant="overline" tone="tertiary" style={{ flex: 1 }}>
          {tr('tournaments.standings.player')}
        </Text>
        <Text variant="overline" tone="tertiary" style={styles.sWdl}>
          {tr('tournaments.standings.wdl')}
        </Text>
        <Text variant="overline" tone="tertiary" style={styles.sScore}>
          {tr('tournaments.standings.score')}
        </Text>
      </View>
      {shown.map((s, i) => {
        const mine = s.userId === me;
        const out = s.status !== 'active';
        return (
          <View
            key={s.userId}
            style={[styles.sRow, { borderBottomColor: c.border, borderBottomWidth: i === shown.length - 1 ? 0 : StyleSheet.hairlineWidth }, mine && { backgroundColor: c.surfaceStrong }, out && { opacity: 0.62 }]}>
            <View style={styles.sRank}>{s.rank <= 3 && s.games > 0 ? <PlaceMark place={s.rank} /> : <Text variant="numeric" tone="muted">{s.rank}</Text>}</View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Row gap="xs" wrap={false}>
                <Pressable onPress={() => router.push({ pathname: '/friends/user/[id]', params: { id: s.userId } })} style={{ flexShrink: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {s.username}
                  </Text>
                </Pressable>
                <Text variant="caption" tone="tertiary">
                  {s.rating}
                </Text>
                {format === 'arena' && isOnFire(s.streak) && <MaterialCommunityIcons accessibilityLabel={tr('tournaments.standings.onFire')} name="fire" size={15} color={c.text} />}
              </Row>
              <Row gap="xs" wrap>
                {mine && <Badge label={tr('tournaments.standings.you')} tone="solid" />}
                {s.playingGameId && (
                  <Pressable onPress={() => router.push({ pathname: '/watch/[gameId]', params: { gameId: s.playingGameId! } })}>
                    <Badge label={tr('tournaments.standings.playing')} tone="live" />
                  </Pressable>
                )}
                {s.status !== 'active' && <Badge label={tr(`tournaments.standings.${s.status}`)} tone={s.status === 'removed' ? 'danger' : 'outline'} />}
                {s.prize && <Badge label={prizeText(s.prize)} tone={s.prize.paidAt ? 'success' : 'neutral'} icon={<Ionicons name="trophy-outline" size={10} color={c.text} />} />}
                {format === 'swiss' && s.games > 0 && (
                  <Text variant="caption" tone="tertiary">
                    {tr('tournaments.standings.tieBreak', { value: s.buchholz })}
                  </Text>
                )}
              </Row>
            </View>
            <Text variant="numeric" tone="muted" style={styles.sWdl}>
              {s.wins}/{s.draws}/{s.losses}
            </Text>
            <Text variant="figure" style={[styles.sScore, { fontSize: 17 }]}>
              {formatScore(s.score)}
            </Text>
            {renderActions?.(s)}
          </View>
        );
      })}
    </View>
  );
}

export function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : `${Math.floor(n) || ''}½`;
}

/** Recent pairings, newest first. Live games open the spectator view. */
export function Pairings({ rows, me }: { rows: TournamentPairing[]; me?: string | null }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const { rtl } = useI18n();
  if (rows.length === 0) return <Text tone="muted" style={{ padding: 16 }}>{tr('tournaments.pairings.empty')}</Text>;
  return (
    <View>
      {rows.map((g, i) => {
        const live = g.result === '*';
        const mine = me && (g.white.id === me || g.black?.id === me);
        const result = g.result === 'bye' ? tr('tournaments.pairings.bye') : g.result === 'void' ? tr('tournaments.pairings.void') : live ? tr('tournaments.pairings.live') : g.result === '+-' ? '1–0 ff' : g.result === '-+' ? '0–1 ff' : g.result.replace('1/2', '½').replace('1/2', '½');
        return (
          <Pressable
            key={g.gameId}
            disabled={!live}
            onPress={() => router.push({ pathname: '/watch/[gameId]', params: { gameId: g.gameId } })}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.pRow,
              { borderBottomColor: c.border, borderBottomWidth: i === rows.length - 1 ? 0 : StyleSheet.hairlineWidth },
              mine && { backgroundColor: c.surfaceStrong },
              hovered && live && { backgroundColor: c.surfaceSunken },
            ]}>
            <Text variant="overline" tone="tertiary" style={{ width: 34 }}>
              {tr('tournaments.pairings.round', { round: g.round })}
            </Text>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.dot, { backgroundColor: c.bg, borderColor: c.borderStrong }]} />
              <Text numberOfLines={1} style={{ flexShrink: 1 }}>
                {g.white.username}
              </Text>
              {g.black && (
                <>
                  <Text tone="tertiary">–</Text>
                  <View style={[styles.dot, { backgroundColor: c.text, borderColor: c.text }]} />
                  <Text numberOfLines={1} style={{ flexShrink: 1 }}>
                    {g.black.username}
                  </Text>
                </>
              )}
            </View>
            {live ? <Badge label={result} tone="live" /> : <Text variant="numeric" tone={g.result === 'void' ? 'tertiary' : 'default'}>{result}</Text>}
            {live && <Ionicons name={dirIcon('chevron-forward')} size={13} color={c.textTertiary} style={rtl ? undefined : undefined} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardFoot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 8, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  mark: { borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' },
  prize: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  place: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  sHead: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  sRank: { width: 30, alignItems: 'flex-start' },
  sWdl: { width: 64, textAlign: 'right' },
  sScore: { width: 40, textAlign: 'right' },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1 },
});
