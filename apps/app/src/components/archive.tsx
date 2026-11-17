import { formatTimeControl, opponentOf, viewerOutcome, type ArchivedGame } from '@chessmate/core';
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { useTheme } from '@/constants/theme';

/** Pill toggle used by the archive filters. */
export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? t.accent : t.surface, borderColor: active ? t.accent : t.glassBorder, opacity: pressed ? 0.75 : 1 },
      ]}>
      <Text style={[styles.chipText, { color: active ? t.onAccent : t.text }]}>{label}</Text>
    </Pressable>
  );
}

/** One labelled, horizontally scrolling row of single-choice chips. */
export function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.chipRowWrap}>
      <Text style={[styles.rowLabel, { color: t.muted }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {options.map((o) => (
          <Chip key={o.value} label={o.label} active={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </ScrollView>
    </View>
  );
}

/** Square badge: W / L / D from the viewer's side, or the raw score otherwise. */
export function ResultBadge({ game }: { game: ArchivedGame }) {
  const t = useTheme();
  const o = viewerOutcome(game);
  const text = o === 'win' ? 'W' : o === 'loss' ? 'L' : o === 'draw' ? 'D' : game.result === '1/2-1/2' ? '½' : game.result;
  const solid = o === 'win';
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: solid ? t.accent : t.surface, borderColor: o === 'loss' ? t.danger : t.glassBorder },
      ]}>
      <Text style={[styles.badgeText, { color: solid ? t.onAccent : o === 'loss' ? t.danger : t.text, fontSize: text.length > 2 ? 11 : 16 }]}>{text}</Text>
    </View>
  );
}

const SOURCE: Record<ArchivedGame['source'], string> = { online: 'Online', practice: 'Practice', import: 'Imported' };

export function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}

export function playerLabel(name: string, rating: number | null) {
  return rating != null ? `${name} (${Math.round(rating)})` : name;
}

/** Summary line under the players: category, time control, moves, date. */
export function gameMeta(g: ArchivedGame): string {
  const parts: string[] = [];
  if (g.category) parts.push(g.category[0]!.toUpperCase() + g.category.slice(1));
  if (g.timeControl) parts.push(formatTimeControl(g.timeControl));
  if (g.source !== 'online') parts.push(SOURCE[g.source]);
  else if (g.rated) parts.push('Rated');
  parts.push(`${Math.ceil(g.moves.length / 2)} moves`);
  parts.push(formatDate(g.endedAt));
  return parts.join(' · ');
}

export function GameRow({ game, onPress }: { game: ArchivedGame; onPress: () => void }) {
  const t = useTheme();
  const opp = opponentOf(game);
  const title = opp ? `vs ${playerLabel(opp, game.myColor === 'w' ? game.blackRating : game.whiteRating)}` : `${game.white} vs ${game.black}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open game ${title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderColor: t.glassBorder, opacity: pressed ? 0.8 : 1 }]}>
      <BlurView intensity={30} tint={t.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.surface }]} />
      <ResultBadge game={game} />
      <View style={styles.rowBody}>
        <View style={styles.rowTitle}>
          {game.myColor && <SideDot color={game.myColor} />}
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {game.opening && (
          <Text style={[styles.sub, { color: t.text }]} numberOfLines={1}>
            {game.eco ? `${game.eco} · ` : ''}
            {game.opening}
          </Text>
        )}
        <Text style={[styles.sub, { color: t.muted }]} numberOfLines={1}>
          {gameMeta(game)}
        </Text>
      </View>
      <Text style={[styles.chevron, { color: t.muted }]}>›</Text>
    </Pressable>
  );
}

/** Small square showing which colour a player had. */
export function SideDot({ color }: { color: 'w' | 'b' }) {
  const t = useTheme();
  return <View style={[styles.side, { backgroundColor: color === 'w' ? '#FFFFFF' : '#0B0B0C', borderColor: t.muted }]} />;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: t.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '600' },
  chipRowWrap: { gap: 6 },
  chipRow: { gap: 8, paddingRight: 8 },
  rowLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  badge: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  side: { width: 10, height: 10, borderRadius: 3, borderWidth: 1 },
  title: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  sub: { fontSize: 13 },
  chevron: { fontSize: 24, fontWeight: '300' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
});
