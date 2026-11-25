import {
  explorerShares,
  explorerTotal,
  formatGameCount,
  formatScore,
  movePlayedShare,
  type ExplorerCounts,
  type ExplorerPosition,
  type Score,
} from '@chessmate/core';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatNumber, useT } from '@/i18n';
import { Text, useAppTheme } from '@/ui';

/** Result bar colours: the pieces' own, the same in light and dark mode. */
const WHITE = '#F2F2EF';
const DRAW = '#8B8B90';
const BLACK = '#1E1E21';

/**
 * White wins, draws and Black wins as one bar, like the explorer column on
 * the big sites. Percents are written inside a part when it has room.
 */
export function ResultBar({ counts, height = 22 }: { counts: ExplorerCounts; height?: number }) {
  const s = explorerShares(counts);
  const tr = useT();
  if (!explorerTotal(counts)) return <View style={[styles.bar, { height, backgroundColor: DRAW, opacity: 0.25 }]} />;
  return (
    <View
      accessible
      accessibilityLabel={`${tr('explorer.col.results')}: ${s.white}% · ${s.draws}% · ${s.black}%`}
      style={[styles.bar, { height, direction: 'ltr' }]}>
      {s.white > 0 && (
        <View style={[styles.part, { flex: s.white, backgroundColor: WHITE }]}>
          {s.white >= 14 && <Text style={[styles.pct, { color: '#3A3A3F' }]}>{s.white}%</Text>}
        </View>
      )}
      {s.draws > 0 && (
        <View style={[styles.part, { flex: s.draws, backgroundColor: DRAW }]}>
          {s.draws >= 14 && <Text style={[styles.pct, { color: '#FFFFFF' }]}>{s.draws}%</Text>}
        </View>
      )}
      {s.black > 0 && (
        <View style={[styles.part, { flex: s.black, backgroundColor: BLACK, alignItems: 'flex-end' }]}>
          {s.black >= 14 && <Text style={[styles.pct, { color: '#F2F2EF' }]}>{s.black}%</Text>}
        </View>
      )}
    </View>
  );
}

/** An engine score as a chip: light for White's advantage, dark for Black's. */
export function EvalChip({ score, pending }: { score: Score | undefined; pending: boolean }) {
  const t = useAppTheme();
  if (!score) {
    return (
      <View style={[styles.chip, { backgroundColor: t.colors.surfaceSunken }]}>
        <Text variant="numeric" tone="muted" style={styles.chipText}>
          {pending ? '…' : '–'}
        </Text>
      </View>
    );
  }
  const white = score.mate !== undefined ? score.mate > 0 : (score.cp ?? 0) >= 0;
  return (
    <View style={[styles.chip, { backgroundColor: white ? WHITE : BLACK, borderColor: t.colors.border, borderWidth: StyleSheet.hairlineWidth }]}>
      <Text variant="numeric" style={[styles.chipText, { color: white ? '#1E1E21' : '#F2F2EF' }]}>
        {formatScore(score)}
      </Text>
    </View>
  );
}

export interface ExplorerTableProps {
  position: ExplorerPosition;
  /** Ply of the position (0 = before White's first move), for move numbers. */
  ply: number;
  evals: Map<string, Score>;
  /** Evals are on and still coming. */
  evalsPending: boolean;
  onPlay: (uci: string) => void;
  /** The move that is next on the line being looked at, highlighted. */
  next?: string | null;
}

/** The moves played from a position: move, engine eval, share played, games, and results. */
export function ExplorerTable({ position, ply, evals, evalsPending, onPlay, next }: ExplorerTableProps) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const num = Math.floor(ply / 2) + 1;
  const prefix = ply % 2 === 0 ? `${num}.` : `${num}…`;
  return (
    <View>
      <View style={[styles.row, styles.head, { borderColor: c.border }]}>
        <Text variant="overline" tone="muted" style={styles.move}>
          {tr('explorer.col.move')}
        </Text>
        <Text variant="overline" tone="muted" style={styles.evalHead}>
          {tr('explorer.col.eval')}
        </Text>
        <Text variant="overline" tone="muted" style={styles.share}>
          %
        </Text>
        <Text variant="overline" tone="muted" style={styles.games}>
          {tr('explorer.col.games')}
        </Text>
        <Text variant="overline" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
          {tr('explorer.col.results')}
        </Text>
      </View>
      {position.moves.map((m) => {
        const total = explorerTotal(m);
        const share = movePlayedShare(position, m);
        const shareText = share >= 1 || share === 0 ? `${Math.round(share)}%` : '<1%';
        return (
          <Pressable
            key={m.uci}
            onPress={() => onPlay(m.uci)}
            accessibilityRole="button"
            accessibilityLabel={`${prefix} ${m.san}, ${tr('explorer.games', { count: total, n: formatNumber(total) })}`}
            style={({ pressed }) => [
              styles.row,
              styles.item,
              { borderColor: c.border, backgroundColor: pressed ? c.surfacePressed : m.uci === next ? c.surfaceSunken : 'transparent' },
            ]}>
            <Text variant="subheading" numberOfLines={1} style={styles.move}>
              <Text variant="label" tone="muted">
                {prefix}{' '}
              </Text>
              {m.san}
            </Text>
            <EvalChip score={evals.get(m.uci)} pending={evalsPending} />
            <Text variant="numeric" tone="muted" style={styles.share}>
              {shareText}
            </Text>
            <Text variant="numeric" style={styles.games} numberOfLines={1}>
              {formatGameCount(total)}
            </Text>
            <View style={{ flex: 1 }}>
              <ResultBar counts={m} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // `direction` goes inline: StyleSheet.create rejects it on the web.
  bar: { flexDirection: 'row', borderRadius: 5, overflow: 'hidden', minWidth: 60 },
  part: { justifyContent: 'center', paddingHorizontal: 5 },
  pct: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  chip: { width: 54, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12.5, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  head: { paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  item: { paddingVertical: 7, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: 6 },
  move: { width: 74 },
  evalHead: { width: 54, textAlign: 'center' },
  share: { width: 38, textAlign: 'right' },
  games: { width: 46, textAlign: 'right' },
});
