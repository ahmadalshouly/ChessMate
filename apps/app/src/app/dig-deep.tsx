import {
  EXPLORER_RATINGS,
  EXPLORER_SPEEDS,
  Game,
  START_FEN,
  explorerTotal,
  openingTimeline,
  type ExplorerRating,
  type ExplorerSource,
  type ExplorerSpeed,
} from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Board } from '@/components/Board';
import { ActionBar } from '@/components/game/ActionBar';
import { Screen } from '@/components/ui';
import { ExplorerTable, ResultBar } from '@/features/explorer/ExplorerTable';
import { setExplorerSettings, useExplorerSettings } from '@/features/explorer/settings';
import { useExplorer } from '@/features/explorer/useExplorer';
import { moveEvalsAvailable, useMoveEvals } from '@/features/explorer/useMoveEvals';
import { dirIcon, formatNumber, useT, type TKey } from '@/i18n';
import { moveFeedback } from '@/lib/feedback';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { useFillHeight, useWideBoard } from '@/lib/useWideBoard';
import { Button, Card, Chip, Switch, Tabs, Text, useAppTheme } from '@/ui';

const SOURCES: ExplorerSource[] = ['lichess', 'masters', 'chessmate'];
const ERROR_TEXT: Record<string, TKey> = {
  busy: 'explorer.error.busy',
  notConnected: 'explorer.error.notConnected',
  unavailable: 'explorer.error.unavailable',
  offline: 'explorer.error.offline',
};

/**
 * Dig Deep, the opening explorer: for the position on the board, every move
 * played from it in millions of games (Lichess, masters, or ChessMate's own),
 * how often, how it went, and what the engine thinks of it. Tap a move to
 * play it; step back with the arrows. Opens on `?moves=e2e4,e7e5` too.
 */
export default function DigDeep() {
  const params = useLocalSearchParams<{ moves?: string; fen?: string; ply?: string }>();
  const [start] = useState(() => validFen(params.fen) ?? START_FEN);
  const [line, setLine] = useState<string[]>(() => validMoves(params.moves, start));
  const [cursor, setCursor] = useState(() => clampPly(Number(params.ply ?? line.length), line.length));
  const [flip, setFlip] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const settings = useExplorerSettings();
  const { source, filters } = settings;
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const { height: winH } = useWindowDimensions();
  // Wide screens: board on the left, the explorer beside it. Phones: a smaller board, the table scrolls below.
  const { wide, size: wideSpace, panel: panelWidth } = useWideBoard({ panel: 460, reserve: 130 });
  const boardSpace = wide ? wideSpace : Math.min(wideSpace, winH * 0.4);
  const size = Math.max(200, Math.floor(boardSpace / 8) * 8);
  const [fillH, onFill] = useFillHeight();

  const history = useMemo(() => Game.fromUciMoves(line, start).history(), [line, start]);
  const fen = cursor === 0 ? start : history[cursor - 1]!.fenAfter;
  const last = cursor > 0 ? history[cursor - 1] : undefined;
  const startPly = useMemo(() => {
    const [, turn, , , , full] = start.split(' ');
    return (Number(full) - 1) * 2 + (turn === 'b' ? 1 : 0);
  }, [start]);

  const play = (uci: string) => {
    const g = new Game(fen);
    const played = g.move(uci);
    if (!played) return false;
    moveFeedback(played.san, g.fen);
    if (line[cursor] !== played.uci) setLine([...line.slice(0, cursor), played.uci]);
    setCursor(cursor + 1);
    return true;
  };
  const interaction = useBoardInteraction(fen, () => true, play);

  const explorer = useExplorer(source, fen, filters);
  const position = explorer.answer?.position ?? null;
  const moveList = useMemo(() => (position?.moves ?? []).map((m) => m.uci), [position]);
  const evalsOn = settings.evals && moveEvalsAvailable();
  const evals = useMoveEvals(fen, moveList, evalsOn);
  const evalsPending = evalsOn && moveList.some((m) => !evals.has(m));

  // Arrow keys step through the line on web.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key === 'ArrowLeft') setCursor((n) => Math.max(0, n - 1));
      if (e.key === 'ArrowRight') setCursor((n) => Math.min(line.length, n + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [line.length]);

  const moveLabel = (i: number) => {
    const ply = startPly + i;
    const num = Math.floor(ply / 2) + 1;
    return ply % 2 === 0 ? `${num}.` : i === 0 ? `${num}…` : '';
  };

  const toggleSpeed = (s: ExplorerSpeed) => {
    const speeds = filters.speeds.includes(s) ? filters.speeds.filter((x) => x !== s) : [...filters.speeds, s];
    setExplorerSettings({ filters: { ...filters, speeds } });
  };
  const toggleRating = (r: ExplorerRating) => {
    const ratings = filters.ratings.includes(r) ? filters.ratings.filter((x) => x !== r) : [...filters.ratings, r];
    setExplorerSettings({ filters: { ...filters, ratings } });
  };
  const filterSummary = tr('explorer.filterSummary', {
    speeds: filters.speeds.length && filters.speeds.length < EXPLORER_SPEEDS.length ? filters.speeds.map((s) => tr(`explorer.speed.${s}`)).join(', ') : tr('explorer.anySpeed'),
    ratings: filters.ratings.length && filters.ratings.length < EXPLORER_RATINGS.length ? ratingRange(filters.ratings) : tr('explorer.anyRating'),
  });

  const total = position ? explorerTotal(position) : 0;
  // This position's own name, else the last named one on the way here.
  const timeline = useMemo(() => openingTimeline(line, start), [line, start]);
  const opening = position?.opening ?? timeline[cursor] ?? null;
  const boardArea = (
    <View style={{ width: size, gap: 10 }}>
      <View style={{ width: size, height: size, direction: 'ltr' }}>
        <Board
          fen={fen}
          orientation={flip ? 'b' : 'w'}
          size={size}
          selected={interaction.selected}
          targets={interaction.targets}
          lastMove={last ? { from: last.from, to: last.to } : null}
          checkSquare={checkSquareOf(fen)}
          onSquarePress={interaction.onSquarePress}
          {...interaction.dragProps}
        />
      </View>
      {/* Move navigation follows the board, which stays left-to-right in every language. */}
      <ActionBar
        actions={[
          { key: 'first', icon: dirIcon('page-first'), label: tr('review.first'), onPress: () => setCursor(0), disabled: cursor === 0 },
          { key: 'prev', icon: dirIcon('chevron-left'), label: tr('review.prev'), onPress: () => setCursor((n) => Math.max(0, n - 1)), disabled: cursor === 0, repeat: true },
          { key: 'next', icon: dirIcon('chevron-right'), label: tr('review.next'), onPress: () => setCursor((n) => Math.min(line.length, n + 1)), disabled: cursor >= line.length, repeat: true },
          { key: 'last', icon: dirIcon('page-last'), label: tr('review.last'), onPress: () => setCursor(line.length), disabled: cursor >= line.length },
          { key: 'flip', icon: 'swap-vertical', label: tr('review.flip'), onPress: () => setFlip((f) => !f) },
        ]}
      />
    </View>
  );

  return (
    <Screen>
      <View style={[styles.layout, wide && styles.layoutWide]} onLayout={onFill}>
        <View style={[styles.fixed, wide && { paddingTop: 16 }]}>{boardArea}</View>
        <ScrollView
          style={[styles.panel, wide && { flexGrow: 0, flexShrink: 0, flexBasis: panelWidth, width: panelWidth, height: fillH, alignSelf: 'stretch' }]}
          contentContainerStyle={[styles.panelContent, { width: wide ? panelWidth - 4 : Math.max(size, 320) }, !wide && { alignSelf: 'center' }]}>
          <Tabs items={SOURCES.map((s) => ({ key: s, label: tr(`explorer.source.${s}`) }))} value={source} onChange={(s) => setExplorerSettings({ source: s })} />

          <Card padding="md" gap="sm">
            <View style={styles.row}>
              <Ionicons name="compass-outline" size={20} color={c.text} />
              <Text variant="subheading" style={{ flex: 1 }} numberOfLines={2}>
                {opening ? `${opening.eco} · ${opening.name}` : tr('explorer.start')}
              </Text>
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">{tr(`explorer.sourceNote.${source}`)}</Text>
                {position && (
                  <Text variant="caption" tone="muted">
                    {tr('explorer.games', { count: total, n: formatNumber(total) })}
                  </Text>
                )}
              </View>
              {source === 'lichess' && (
                <Pressable
                  onPress={() => setShowFilters((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showFilters }}
                  accessibilityLabel={tr('explorer.filters')}
                  hitSlop={8}
                  style={({ pressed }) => [styles.filterButton, { borderColor: c.border, backgroundColor: pressed ? c.surfacePressed : 'transparent' }]}>
                  <Ionicons name="funnel-outline" size={15} color={c.text} />
                  <Text variant="label">{tr('explorer.filters')}</Text>
                </Pressable>
              )}
            </View>
            {source === 'lichess' && !showFilters && (
              <Text variant="caption" tone="muted">
                {filterSummary}
              </Text>
            )}
            {source === 'lichess' && showFilters && (
              <View style={{ gap: 8 }}>
                <Text variant="overline" tone="muted">
                  {tr('explorer.speedTitle')}
                </Text>
                <View style={styles.chips}>
                  {EXPLORER_SPEEDS.map((s) => (
                    <Chip key={s} label={tr(`explorer.speed.${s}`)} selected={filters.speeds.includes(s)} onPress={() => toggleSpeed(s)} />
                  ))}
                </View>
                <Text variant="overline" tone="muted">
                  {tr('explorer.ratingTitle')}
                </Text>
                <View style={styles.chips}>
                  {EXPLORER_RATINGS.map((r) => (
                    <Chip key={r} label={r === 2500 ? '2500+' : String(r)} selected={filters.ratings.includes(r)} onPress={() => toggleRating(r)} />
                  ))}
                </View>
              </View>
            )}
            {position && total > 0 && <ResultBar counts={position} height={18} />}
          </Card>

          <Card padding="md" gap="sm">
            {explorer.error ? (
              <View style={{ gap: 10 }}>
                <Text tone="muted">{tr(ERROR_TEXT[explorer.error] ?? 'explorer.error.unavailable')}</Text>
                <Button title={tr('explorer.retry')} variant="secondary" onPress={explorer.retry} />
              </View>
            ) : !position ? (
              <Text tone="muted">…</Text>
            ) : position.moves.length === 0 ? (
              <Text tone="muted">{tr(source === 'chessmate' ? 'explorer.emptyChessmate' : 'explorer.empty')}</Text>
            ) : (
              <View style={{ opacity: explorer.loading ? 0.55 : 1 }}>
                <ExplorerTable position={position} ply={startPly + cursor} evals={evals} evalsPending={evalsPending} onPlay={play} next={line[cursor] ?? null} />
              </View>
            )}
            {explorer.answer?.stale && (
              <Text variant="caption" tone="muted">
                {tr('explorer.stale')}
              </Text>
            )}
          </Card>

          <Card padding="md" gap="sm">
            <Text variant="overline" tone="muted">
              {tr('explorer.moves')}
            </Text>
            {line.length === 0 ? (
              <Text variant="caption" tone="muted">
                {tr('explorer.noMoves')}
              </Text>
            ) : (
              <View style={styles.moves}>
                <Pressable onPress={() => setCursor(0)} style={[styles.moveChip, cursor === 0 && { backgroundColor: c.accent }]} accessibilityLabel={tr('explorer.reset')}>
                  <Ionicons name="home-outline" size={13} color={cursor === 0 ? c.onAccent : c.muted} />
                </Pressable>
                {history.map((m, i) => (
                  <Pressable key={i} onPress={() => setCursor(i + 1)} style={[styles.moveChip, cursor === i + 1 && { backgroundColor: c.accent }]}>
                    <Text variant="label" color={cursor === i + 1 ? c.onAccent : c.text}>
                      {moveLabel(i) ? <Text variant="label" color={cursor === i + 1 ? c.onAccent : c.muted}>{moveLabel(i)} </Text> : null}
                      {m.san}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Card>

          <Card padding="md" gap="sm">
            <View style={styles.row}>
              <Text variant="label" style={{ flex: 1 }}>
                {tr('explorer.engine')}
              </Text>
              <Switch value={settings.evals} onValueChange={(v) => setExplorerSettings({ evals: v })} accessibilityLabel={tr('explorer.engine')} />
            </View>
            {settings.evals && !moveEvalsAvailable() && (
              <Text variant="caption" tone="muted">
                {tr('explorer.engineOff')}
              </Text>
            )}
            <Button
              title={tr('explorer.openInAnalysis')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/analysis', params: { moves: line.join(','), initialFen: start, ply: String(cursor) } })}
            />
            {source !== 'chessmate' && (
              <Text variant="caption" tone="muted">
                {tr(`explorer.credit.${source}`)}
              </Text>
            )}
          </Card>
        </ScrollView>
      </View>
    </Screen>
  );
}

/** "1600–2199", "2000+", or "1200, 2200" when the chosen rating groups don't touch. */
function ratingRange(ratings: ExplorerRating[]): string {
  const idx = [...ratings].sort((a, b) => a - b).map((r) => EXPLORER_RATINGS.indexOf(r));
  const label = (i: number) => (EXPLORER_RATINGS[i] === 2500 ? '2500+' : String(EXPLORER_RATINGS[i]));
  if (!idx.every((v, k) => k === 0 || v === idx[k - 1]! + 1)) return idx.map(label).join(', ');
  const lo = EXPLORER_RATINGS[idx[0]!]!;
  const next = EXPLORER_RATINGS[idx[idx.length - 1]! + 1];
  return next === undefined ? `${lo}+` : `${lo}–${next - 1}`;
}

function validFen(fen?: string): string | null {
  if (!fen) return null;
  try {
    return new Game(fen).fen;
  } catch {
    return null;
  }
}

function validMoves(moves: string | undefined, start: string): string[] {
  if (!moves) return [];
  try {
    return Game.fromUciMoves(moves.split(',').filter(Boolean), start).uciHistory();
  } catch {
    return [];
  }
}

function clampPly(n: number, max: number) {
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : max;
}

const styles = StyleSheet.create({
  layout: { flex: 1, minHeight: 0 },
  layoutWide: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingHorizontal: 16 },
  fixed: { alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  panel: { flex: 1, flexGrow: 1 },
  panelContent: { gap: 12, paddingVertical: 12, paddingHorizontal: 2, paddingBottom: 32 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  moves: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  moveChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, minHeight: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
});
