import { Game, START_FEN, importPosition, parseUci } from '@chessmate/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Board } from '@/components/Board';
import { BoardArrows, type Arrow } from '@/components/BoardArrows';
import { EvalBar } from '@/components/EvalBar';
import { Button, Card, Label, Screen } from '@/components/ui';
import { ARROW_COLORS, formatEval } from '@/constants/analysis';
import { useTheme } from '@/constants/theme';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';
import { useEngine } from '@/lib/useEngine';

const EVAL_BAR = 16;

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
  moveChip: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  input: { minHeight: 90, borderWidth: 1, borderRadius: 10, padding: 10, textAlignVertical: 'top', fontSize: 14 },
});
