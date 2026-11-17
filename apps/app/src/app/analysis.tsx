import {
  Game,
  START_FEN,
  classifyMove,
  importPosition,
  openingTimeline,
  parseUci,
  positionKey,
  terminalScore,
  type MoveJudgement,
  type PositionAnalysis,
} from '@chessmate/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { BoardArrows, type Arrow } from '@/components/BoardArrows';
import { EvalBar } from '@/components/EvalBar';
import { BoardMoveBadge, MoveBadge } from '@/components/MoveBadge';
import { Button, Card, Label, Screen } from '@/components/ui';
import { ARROW_COLORS, MOVE_CLASS, formatEval } from '@/constants/analysis';
import { useTheme } from '@/constants/theme';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';
import { useEngine } from '@/lib/useEngine';

const EVAL_BAR = 20;
/** Depth an engine result needs before it is used to grade moves. */
const GRADE_DEPTH = 12;

/**
 * Analysis board: explore any position (from a FEN, a PGN, or a finished
 * game) with Stockfish running on the server. Moves for both sides are free;
 * a move away from the current line starts a new line from that point.
 */
export default function Analysis() {
  const params = useLocalSearchParams<{ fen?: string; moves?: string; initialFen?: string; ply?: string }>();
  const [start, setStart] = useState(() => validFen(params.initialFen ?? params.fen) ?? START_FEN);
  const [line, setLine] = useState<string[]>(() => validMoves(params.moves, start));
  const [cursor, setCursor] = useState(() => clampPly(Number(params.ply ?? line.length), line.length));
  const [flip, setFlip] = useState(false);
  const [engineOn, setEngineOn] = useState(true);
  const [multipv, setMultipv] = useState(3);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const t = useTheme();
  const size = useBoardSize(300) - EVAL_BAR - 6;
  const engine = useEngine();

  const history = useMemo(() => Game.fromUciMoves(line, start).history(), [line, start]);
  const fen = cursor === 0 ? start : history[cursor - 1]!.fenAfter;
  const last = cursor > 0 ? history[cursor - 1] : undefined;
  const orientation = flip ? 'b' : 'w';
  const startPly = useMemo(() => {
    const [, turn, , , , full] = start.split(' ');
    return (Number(full) - 1) * 2 + (turn === 'b' ? 1 : 0);
  }, [start]);

  const play = (uci: string) => {
    const played = new Game(fen).move(uci);
    if (!played) return false;
    if (line[cursor] === played.uci) setCursor(cursor + 1);
    else {
      setLine([...line.slice(0, cursor), played.uci]);
      setCursor(cursor + 1);
    }
    return true;
  };
  const interaction = useBoardInteraction(fen, () => true, play);

  // Ask the engine about every position we land on (debounced while stepping through moves).
  const { analyze, stop } = engine;
  useEffect(() => {
    if (!engineOn) return stop();
    const id = setTimeout(() => analyze(fen, multipv), 120);
    return () => clearTimeout(id);
  }, [fen, engineOn, multipv, analyze, stop]);

  // Arrow keys step through the line on web.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'TEXTAREA' || (e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') setCursor((c) => Math.max(0, c - 1));
      if (e.key === 'ArrowRight') setCursor((c) => Math.min(line.length, c + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [line.length]);

  // Keep the deepest result per position, so every move on the line can be graded once
  // the engine has seen the position before it and the position after it.
  const [seen, setSeen] = useState<Map<string, PositionAnalysis>>(() => new Map());
  const latest = engine.state.analysis;
  const [recorded, setRecorded] = useState(latest);
  if (latest !== recorded) {
    setRecorded(latest);
    if (latest && (latest.terminal || (latest.depth >= GRADE_DEPTH && latest.lines[0]))) setSeen((prev) => remember(prev, latest));
  }
  const openings = useMemo(() => openingTimeline(line, start), [line, start]);
  const grades = useMemo(() => gradeLine(start, history, seen, openings), [start, history, seen, openings]);
  const lastGrade = cursor > 0 ? grades[cursor - 1] : undefined;

  const analysis = engineOn && engine.state.analysis?.fen === new Game(fen).fen ? engine.state.analysis : null;
  const top = analysis?.lines[0];
  const arrows: Arrow[] = (analysis?.lines ?? [])
    .slice(0, 3)
    .map((l, i) => {
      const m = l.pv[0] ? parseUci(l.pv[0]) : null;
      return m ? { from: m.from, to: m.to, color: ARROW_COLORS[i]! } : null;
    })
    .filter((a): a is Arrow => a !== null)
    .reverse();
  const locked = engine.state.error?.code === 'engine_locked';
  const unavailable = engine.state.error?.code === 'engine_unavailable';

  const doImport = () => {
    const imported = importPosition(importText);
    if (!imported) return setImportError('Could not read that. Paste a FEN or a PGN.');
    setImportError(null);
    setStart(imported.initialFen);
    setLine(imported.moves);
    setCursor(imported.moves.length);
    setShowImport(false);
    setImportText('');
    interaction.clear();
  };

  const moveLabel = (i: number) => {
    const ply = startPly + i;
    const num = Math.floor(ply / 2) + 1;
    return ply % 2 === 0 ? `${num}.` : i === 0 ? `${num}…` : '';
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={{ width: size + EVAL_BAR + 6, gap: 12 }}>
          <View style={styles.boardRow}>
            <EvalBar score={engineOn ? (top?.score ?? null) : null} orientation={orientation} height={size} width={EVAL_BAR} />
            <View style={{ width: size, height: size }}>
              <Board
                fen={fen}
                orientation={orientation}
                size={size}
                selected={interaction.selected}
                targets={interaction.targets}
                lastMove={last ? { from: last.from, to: last.to } : null}
                checkSquare={checkSquareOf(fen)}
                onSquarePress={interaction.onSquarePress}
              />
              {engineOn && <BoardArrows arrows={arrows} size={size} orientation={orientation} />}
              {engineOn && last && lastGrade && <BoardMoveBadge square={last.to} cls={lastGrade.classification} size={size} orientation={orientation} />}
            </View>
          </View>

          <View style={styles.row}>
            <NavButton label="⏮" onPress={() => setCursor(0)} disabled={cursor === 0} />
            <NavButton label="◀" onPress={() => setCursor(cursor - 1)} disabled={cursor === 0} />
            <NavButton label="▶" onPress={() => setCursor(cursor + 1)} disabled={cursor >= line.length} />
            <NavButton label="⏭" onPress={() => setCursor(line.length)} disabled={cursor >= line.length} />
            <NavButton label="⇅" onPress={() => setFlip((f) => !f)} />
          </View>

          <Card>
            <View style={styles.row}>
              <Label bold size={18}>
                {analysis?.terminal ? terminalText(analysis.terminal) : top ? formatEval(top.score) : engineOn ? '…' : 'Engine off'}
              </Label>
              {!!analysis?.depth && <Label muted>depth {analysis.depth}</Label>}
              <View style={styles.toggle}>
                <Pressable onPress={() => setMultipv((m) => (m === 1 ? 3 : 1))} accessibilityRole="button">
                  <Label muted>{multipv} {multipv === 1 ? 'line' : 'lines'}</Label>
                </Pressable>
                <Switch value={engineOn} onValueChange={setEngineOn} accessibilityLabel="Engine" />
              </View>
            </View>
            {engineOn && last && lastGrade && (
              <View style={styles.row}>
                <MoveBadge cls={lastGrade.classification} size={52} variant="full" />
                <Label>
                  {last.san} is {MOVE_CLASS[lastGrade.classification].phrase}
                </Label>
              </View>
            )}
            {locked && <Label muted>Engine analysis is off while you have a live game. It comes back when the game ends.</Label>}
            {unavailable && <Label muted>{engine.state.error?.message}</Label>}
            {!engine.state.connected && engineOn && <Label muted>Connecting to the engine…</Label>}
            {engineOn &&
              analysis?.lines.map((l) => (
                <Pressable
                  key={l.multipv}
                  onPress={() => l.pv[0] && play(l.pv[0])}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.pvRow, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}>
                  <Text style={[styles.pvScore, { color: t.text, backgroundColor: t.surface }]}>{formatEval(l.score)}</Text>
                  <Text numberOfLines={2} style={{ color: t.muted, flex: 1 }}>
                    {formatLine(l.san, startPly + cursor)}
                  </Text>
                </Pressable>
              ))}
          </Card>

          <Card>
            <Label bold>Moves</Label>
            {line.length === 0 ? (
              <Label muted>Move pieces for either side, or import a game below.</Label>
            ) : (
              <View style={styles.moves}>
                {history.map((m, i) => (
                  <Pressable key={i} onPress={() => setCursor(i + 1)} style={[styles.moveChip, cursor === i + 1 && { backgroundColor: t.accent }]}>
                    <Text style={{ color: cursor === i + 1 ? t.onAccent : t.text }}>
                      {moveLabel(i) ? <Text style={{ color: cursor === i + 1 ? t.onAccent : t.muted }}>{moveLabel(i)} </Text> : null}
                      {m.san}
                    </Text>
                    {engineOn && grades[i] && <MoveBadge cls={grades[i]!.classification} size={16} />}
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.row}>
              <Button variant="secondary" title={showImport ? 'Close' : 'Import FEN / PGN'} onPress={() => setShowImport((s) => !s)} />
              {line.length > 0 && (
                <Button
                  variant="secondary"
                  title="Review game"
                  onPress={() => router.push({ pathname: '/review', params: { moves: line.join(','), initialFen: start } })}
                />
              )}
              {line.length > 0 && (
                <Button
                  variant="secondary"
                  title="Clear"
                  onPress={() => {
                    setStart(START_FEN);
                    setLine([]);
                    setCursor(0);
                  }}
                />
              )}
            </View>
            {showImport && (
              <>
                <TextInput
                  value={importText}
                  onChangeText={setImportText}
                  multiline
                  placeholder={'Paste a FEN or a PGN, e.g. 1. e4 e5 2. Nf3'}
                  placeholderTextColor={t.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
                />
                {importError && <Label muted>{importError}</Label>}
                <Button title="Load" onPress={doImport} disabled={!importText.trim()} />
              </>
            )}
            <Text selectable style={{ color: t.muted, fontSize: 12 }}>
              FEN: {fen}
            </Text>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

/** Stores a result unless a deeper (or equally deep but wider) one is already known. */
function remember(prev: Map<string, PositionAnalysis>, a: PositionAnalysis): Map<string, PositionAnalysis> {
  const key = positionKey(a.fen);
  const old = prev.get(key);
  if (old && (old.depth > a.depth || (old.depth === a.depth && old.lines.length > a.lines.length))) return prev;
  const next = new Map(prev);
  next.set(key, a);
  return next;
}

/**
 * Grades each move of the line from the engine results seen so far. A move is
 * graded once both the position before it and the one after it have been
 * analysed; the rest stay undefined until the player visits them.
 */
function gradeLine(
  start: string,
  history: { fenAfter: string; uci: string }[],
  seen: Map<string, PositionAnalysis>,
  openings: ({ ply: number } | null)[],
): (MoveJudgement | undefined)[] {
  const out: (MoveJudgement | undefined)[] = [];
  let inBook = true;
  history.forEach((m, i) => {
    inBook = inBook && !!openings[i + 1] && openings[i + 1]!.ply === i + 1;
    const fenBefore = i === 0 ? start : history[i - 1]!.fenAfter;
    const before = seen.get(positionKey(fenBefore));
    const after = seen.get(positionKey(m.fenAfter));
    const best = before?.lines[0];
    const playedScore = after?.terminal ? terminalScore(after.fen, after.terminal) : after?.lines[0]?.score;
    if (!best || !playedScore) return out.push(undefined);
    out.push(
      classifyMove({
        fenBefore,
        uci: m.uci,
        bestScore: best.score,
        bestMove: best.pv[0],
        secondBestScore: before.lines[1]?.score,
        playedScore,
        book: inBook,
        previousUci: history[i - 1]?.uci,
        previousLoss: out[i - 1]?.loss,
      }),
    );
  });
  return out;
}

function NavButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Button variant="secondary" title={label} onPress={onPress} disabled={disabled} />
    </View>
  );
}

function formatLine(san: string[], ply: number): string {
  return san
    .slice(0, 10)
    .map((m, i) => {
      const p = ply + i;
      const num = Math.floor(p / 2) + 1;
      if (p % 2 === 0) return `${num}. ${m}`;
      return i === 0 ? `${num}… ${m}` : m;
    })
    .join(' ');
}

function terminalText(t: 'checkmate' | 'stalemate' | 'draw') {
  return t === 'checkmate' ? 'Checkmate' : t === 'stalemate' ? 'Stalemate' : 'Draw';
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
  page: { padding: 12, alignItems: 'center' },
  boardRow: { flexDirection: 'row', gap: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' },
  pvRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  pvScore: { fontWeight: '700', minWidth: 54, textAlign: 'center', paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  moves: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  moveChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  input: { minHeight: 90, borderWidth: 1, borderRadius: 10, padding: 10, textAlignVertical: 'top', fontSize: 14 },
});
