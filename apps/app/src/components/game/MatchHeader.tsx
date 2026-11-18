import type { PlayerInfo, PublicProfile, RecentGame } from '@chessmate/core';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Logo } from '@/components/shell/Logo';
import { useT } from '@/i18n';
import { GlassView, Text, useAppTheme } from '@/ui';

import { GameIcon } from './ActionBar';
import { usePlayerProfile } from './usePlayerProfile';

/** Wins in a row, newest game first. */
export function winStreak(games: RecentGame[] | null | undefined): number {
  if (!games) return 0;
  const sorted = [...games].sort((a, b) => b.endedAt - a.endedAt);
  let n = 0;
  for (const g of sorted) {
    if (g.outcome !== 'win') break;
    n++;
  }
  return n;
}

/** Your wins, draws and losses against one opponent, from your recent games. */
export function headToHead(games: RecentGame[] | null | undefined, opponent: string): { w: number; d: number; l: number } | null {
  if (!games) return null;
  const out = { w: 0, d: 0, l: 0 };
  for (const g of games) {
    if (g.opponent.username.toLowerCase() !== opponent.toLowerCase()) continue;
    if (g.outcome === 'win') out.w++;
    else if (g.outcome === 'draw') out.d++;
    else out.l++;
  }
  return out;
}

export interface BotInfo {
  name: string;
  level: number;
  rating: number;
  tagline: string;
}

/**
 * The top of the game screen: the logo, your win streak and what you should
 * know about your opponent. It fills whatever room the board leaves, showing
 * more the more room there is, so the screen has no empty space.
 */
export function MatchHeader({
  height,
  me,
  opponent,
  bot,
  refreshKey,
  caption,
}: {
  height: number;
  me: PlayerInfo | null;
  opponent?: PlayerInfo | null;
  bot?: BotInfo;
  /** Fetch the profiles again when this changes (a new game). */
  refreshKey?: string;
  /** Shown instead of the streak when there is no account (pass and play). */
  caption?: string;
}) {
  const tr = useT();
  const c = useAppTheme().colors;
  const mine = usePlayerProfile(me, refreshKey);
  const theirs = usePlayerProfile(opponent ?? null, refreshKey);
  if (height < 40) return null;

  const streak = winStreak(mine?.recentGames);
  const signedIn = !!mine;
  const pill = caption ? (
    <Pill icon="account-multiple-outline" text={caption} />
  ) : signedIn ? (
    <Pill icon="fire" text={streak > 0 ? tr('game.header.streakPill', { count: streak }) : tr('game.header.noStreak')} strong={streak >= 3} />
  ) : null;

  const top = (
    <View style={styles.top}>
      <Logo size={height < 90 ? 20 : 24} />
      <View style={{ flex: 1 }} />
      {pill}
    </View>
  );
  if (height < 120) return <View style={[styles.wrap, { justifyContent: 'center' }]}>{top}</View>;

  const tiles: ReactNode[] = [];
  if (signedIn) tiles.push(<Tile key="streak" icon="fire" value={String(streak)} label={tr('game.header.streak')} />);
  if (bot) {
    tiles.push(<Tile key="level" icon="robot-outline" value={String(bot.level)} label={tr('game.header.level')} />);
    tiles.push(<Tile key="rating" icon="chart-line" value={`~${bot.rating}`} label={tr('game.header.rating')} />);
  } else if (opponent) {
    const h2h = signedIn ? headToHead(mine?.recentGames, opponent.name) : null;
    if (h2h) tiles.push(<Tile key="h2h" icon="sword-cross" value={h2h.w + h2h.d + h2h.l ? `${h2h.w}–${h2h.l}` : '0–0'} label={tr('game.header.h2h')} />);
    const totals = theirs?.totals;
    if (totals && totals.games > 0) {
      tiles.push(<Tile key="wr" icon="percent-outline" value={`${Math.round((100 * totals.wins) / totals.games)}%`} label={tr('game.header.winRate')} />);
      tiles.push(<Tile key="games" icon="chess-pawn" value={String(totals.games)} label={tr('game.header.games')} />);
    } else {
      tiles.push(<Tile key="rating" icon="chart-line" value={`${opponent.rating}${opponent.provisional ? '?' : ''}`} label={tr('game.header.rating')} />);
    }
  }

  const form = theirs?.recentGames ? [...theirs.recentGames].sort((a, b) => b.endedAt - a.endedAt).slice(0, 8) : null;
  const showForm = height >= 210 && !!opponent && !!form && form.length > 0;
  const showTagline = height >= 190 && !!bot;

  return (
    <View style={styles.wrap}>
      <GlassView radius="xl" elevation="none" strength="subtle" style={[styles.card, { justifyContent: tiles.length || showForm ? 'space-between' : 'center' }]}>
        {top}
        {tiles.length > 0 && <View style={styles.tiles}>{tiles.slice(0, 3)}</View>}
        {showTagline && (
          <Text tone="muted" numberOfLines={2} style={{ paddingHorizontal: 2 }}>
            {bot!.name}: {bot!.tagline}
          </Text>
        )}
        {showForm && (
          <View style={styles.formRow}>
            <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {tr('game.header.form', { name: opponent!.name })}
            </Text>
            <View style={styles.dots}>
              {form!.map((g) => (
                <View
                  key={g.id}
                  style={[styles.dot, { backgroundColor: g.outcome === 'win' ? c.success : g.outcome === 'loss' ? c.danger : c.textTertiary }]}
                  accessibilityLabel={g.outcome}>
                  <GameIcon name={g.outcome === 'win' ? 'check' : g.outcome === 'loss' ? 'close' : 'minus'} size={12} color="#FFFFFF" />
                </View>
              ))}
            </View>
          </View>
        )}
      </GlassView>
    </View>
  );
}

function Pill({ icon, text, strong }: { icon: 'fire' | 'account-multiple-outline'; text: string; strong?: boolean }) {
  const c = useAppTheme().colors;
  return (
    <View style={[styles.pill, { backgroundColor: strong ? c.accent : c.surfaceSunken, borderColor: strong ? c.accent : c.border }]}>
      <GameIcon name={icon} size={15} color={strong ? c.onAccent : c.text} />
      <Text variant="label" color={strong ? c.onAccent : c.text} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function Tile({ icon, value, label }: { icon: ComponentProps<typeof GameIcon>['name']; value: string; label: string }) {
  const c = useAppTheme().colors;
  return (
    <View style={[styles.tile, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
      <View style={styles.tileTop}>
        <GameIcon name={icon} size={15} color={c.muted} />
        <Text variant="figure" style={styles.tileValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Text variant="overline" tone="tertiary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  card: { flex: 1, padding: 14, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, borderRadius: 15, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, flexShrink: 1 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 10, gap: 2, alignItems: 'center' },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileValue: { fontSize: 22, lineHeight: 26 },
  formRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
