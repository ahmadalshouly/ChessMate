import type { Color, MoveClass } from '@chessmate/core';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MoveBadge } from '@/components/MoveBadge';
import { MOVE_CLASS } from '@/constants/analysis';
import { useT } from '@/i18n';
import { useEngine } from '@/lib/useEngine';
import { Text, useAppTheme } from '@/ui';

/** Shown when found; best and blunders always, so "0 blunders" reads as good news. */
const SHOWN: { cls: MoveClass; always?: boolean }[] = [
  { cls: 'masterpiece' },
  { cls: 'brilliant' },
  { cls: 'great' },
  { cls: 'best', always: true },
  { cls: 'mistake' },
  { cls: 'miss' },
  { cls: 'blunder', always: true },
];

/**
 * The result card's quick review: the engine grades the game as soon as it
 * ends (the server has usually started already) and this shows your accuracy
 * and how many best, brilliant and blunder moves you played. Tapping it opens
 * the full review.
 */
export function QuickReview({
  moves,
  initialFen,
  gameId,
  side,
  onOpen,
}: {
  moves: string[];
  initialFen?: string;
  gameId?: string;
  /** Whose moves to count. */
  side: Color;
  onOpen: () => void;
}) {
  const c = useAppTheme().colors;
  const tr = useT();
  const { state, review } = useEngine();
  const key = moves.join(',');

  useEffect(() => {
    if (key) review({ moves: key.split(','), initialFen, gameId });
  }, [key, initialFen, gameId, review]);

  const result = state.review;
  const progress = state.reviewProgress;
  const pct = progress ? Math.round((100 * progress.done) / Math.max(1, progress.total)) : 0;

  if (state.error && !result) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('play.over.quick.open')}
      onPress={onOpen}
      style={({ pressed }) => [styles.box, { borderColor: c.border, backgroundColor: pressed ? c.surfacePressed : c.surfaceSunken }]}>
      {!result ? (
        <View style={{ gap: 6 }}>
          <Text variant="label" tone="muted">
            {tr('play.over.quick.working', { pct })}
          </Text>
          <View style={[styles.track, { backgroundColor: c.border }]}>
            <View style={[styles.fill, { width: `${Math.max(4, pct)}%`, backgroundColor: c.text }]} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <View style={styles.headRow}>
            <Text variant="label" tone="muted">
              {tr('play.over.quick.title')}
            </Text>
            <Text variant="numeric" style={styles.accuracy}>
              {tr('play.over.quick.accuracy', { n: Math.round(result.accuracy[side]) })}
            </Text>
          </View>
          <View style={styles.counts}>
            {SHOWN.map(({ cls, always }) => {
              const n = result.counts[side]?.[cls] ?? 0;
              if (!n && !always) return null;
              return (
                <View key={cls} style={styles.count} accessibilityLabel={`${n} ${MOVE_CLASS[cls].label}`}>
                  <MoveBadge cls={cls} size={22} />
                  <Text variant="label" style={{ fontWeight: '700' }}>
                    {n}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {MOVE_CLASS[cls].label}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text variant="caption" tone="tertiary">
            {tr('play.over.quick.hint')}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  accuracy: { fontSize: 18 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
