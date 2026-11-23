import {
  Game,
  START_FEN,
  importPosition,
  bookTimeline,
  parseUci,
  type PositionAnalysis,
} from '@chessmate/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { Text, TextInput } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { BoardArrows, type Arrow } from '@/components/BoardArrows';
import { EvalBar } from '@/components/EvalBar';
import { BoardMoveBadge, MoveBadge } from '@/components/MoveBadge';
import { Button, Card, Label, Screen } from '@/components/ui';
import { ARROW_COLORS, MOVE_CLASS, formatEval, moveClassTint } from '@/constants/analysis';
import { useTheme } from '@/constants/theme';
import { dirIcon, translate, useT } from '@/i18n';
import { ActionBar } from '@/components/game/ActionBar';
import { serverText } from '@/i18n/serverMessages';
import { moveFeedback } from '@/lib/feedback';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { GRADE_DEPTH, gradeLine, remember } from '@/features/analysis/grading';
import { useEngine } from '@/lib/useEngine';
import { useFillHeight, useWideBoard } from '@/lib/useWideBoard';
import { EngineSettingsSheet } from '@/components/EngineSettingsSheet';
import { setEngineSettings, useEngineSettings } from '@/lib/engineSettings';

const EVAL_BAR = 20;
/** Depth an engine result needs before it is used to grade moves. */

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
  const settings = useEngineSettings();
  const multipv = settings.lines;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const t = useTheme();
  const tr = useT();
  const { height: winH } = useWindowDimensions();
  // Wide screens (web, tablets): a big board on the left, panel scrolls on the right.
  // Phones: board and move buttons stay put; the panel scrolls underneath.
  const { wide, size: wideSpace, panel: panelWidth } = useWideBoard({ panel: 404, reserve: 130 });
  const boardSpace = wide ? wideSpace : Math.min(wideSpace, winH * 0.56);
  const size = Math.max(200, Math.floor((boardSpace - EVAL_BAR - 6) / 8) * 8);
  // The panel beside the board scrolls within the window height (web).
  const [fillH, onFill] = useFillHeight();
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
    const g = new Game(fen);
    const played = g.move(uci);
    if (!played) return false;
    moveFeedback(played.san, g.fen);
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
    const id = setTimeout(() => analyze(fen, multipv, { depth: settings.depth, movetimeMs: settings.seconds * 1000 }), 120);
    return () => clearTimeout(id);
  }, [fen, engineOn, multipv, settings.depth, settings.seconds, analyze, stop]);

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
  const theory = useMemo(() => bookTimeline(line, start), [line, start]);
  const allGrades = useMemo(() => gradeLine(start, history, seen, theory), [start, history, seen, theory]);
  const grades = settings.grades ? allGrades : [];
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
    if (!imported) return setImportError(tr('analysis.importError'));
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

  const boardArea = (
    <View style={{ width: size + EVAL_BAR + 6, gap: 10 }}>
      <View style={[styles.boardRow, { direction: 'ltr' }]}>
        <EvalBar score={engineOn ? (top?.score ?? null) : null} orientation={orientation} height={size} width={EVAL_BAR} />
        <View style={{ width: size, height: size }}>
          <Board
            fen={fen}
            orientation={orientation}
            size={size}
            selected={interaction.selected}
            targets={interaction.targets}
            lastMove={last ? { from: last.from, to: last.to } : null}
            lastMoveColor={engineOn && last && lastGrade ? moveClassTint(lastGrade.classification) : null}
            checkSquare={checkSquareOf(fen)}
            onSquarePress={interaction.onSquarePress}
            {...interaction.dragProps}
          />
          {engineOn && settings.arrows && <BoardArrows arrows={arrows} size={size} orientation={orientation} />}
          {engineOn && last && lastGrade && <BoardMoveBadge square={last.to} cls={lastGrade.classification} size={size} orientation={orientation} />}
        </View>
      </View>

      {/* Move navigation follows the board, which stays left-to-right in every language. */}
      <ActionBar
        actions={[
          { key: 'first', icon: dirIcon('page-first'), label: tr('review.first'), onPress: () => setCursor(0), disabled: cursor === 0 },
          { key: 'prev', icon: dirIcon('chevron-left'), label: tr('review.prev'), onPress: () => setCursor((c) => Math.max(0, c - 1)), disabled: cursor === 0, repeat: true },
          { key: 'next', icon: dirIcon('chevron-right'), label: tr('review.next'), onPress: () => setCursor((c) => Math.min(line.length, c + 1)), disabled: cursor >= line.length, repeat: true },
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
          contentContainerStyle={[styles.panelContent, { width: wide ? panelWidth - 4 : size + EVAL_BAR + 6 }, !wide && { alignSelf: 'center' }]}
          keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() => setSettingsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={tr('analysis.settings.title')}
            style={({ pressed }) => [styles.settingsRow, { borderColor: t.border, backgroundColor: pressed ? t.border : t.surface }]}>
            <Ionicons name="options-outline" size={18} color={t.text} />
            <View style={{ flex: 1 }}>
              <Label bold>{tr('analysis.settings.title')}</Label>
              <Label muted>{tr('analysis.settings.summary', { depth: settings.depth, lines: settings.lines, seconds: settings.seconds })}</Label>
            </View>
            <Ionicons name="chevron-forward" size={16} color={t.muted} />
          </Pressable>
          <Card>
            <View style={styles.row}>
              <Label bold size={18}>
                {analysis?.terminal ? terminalText(analysis.terminal) : top ? formatEval(top.score) : engineOn ? '…' : tr('analysis.engineOff')}
              </Label>
              {!!analysis?.depth && <Label muted>{tr('analysis.depthOf', { n: analysis.depth, max: settings.depth })}</Label>}
              <View style={styles.toggle}>
                <Pressable onPress={() => setEngineSettings({ lines: multipv === 1 ? 3 : 1 })} accessibilityRole="button">
                  <Label muted>{tr('analysis.lines', { count: multipv })}</Label>
                </Pressable>
                <Switch value={engineOn} onValueChange={setEngineOn} accessibilityLabel={tr('analysis.engine')} />
                <Pressable
                  onPress={() => setSettingsOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={tr('analysis.settings.title')}
                  hitSlop={8}
                  style={({ pressed }) => [styles.gear, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}>
                  <Ionicons name="options-outline" size={18} color={t.text} />
                </Pressable>
              </View>
            </View>
            {engineOn && last && lastGrade && (
              <View style={styles.row}>
                <MoveBadge cls={lastGrade.classification} size={52} variant="full" />
                <Label>{tr('review.moveIs', { move: last.san, cls: MOVE_CLASS[lastGrade.classification].phrase })}</Label>
              </View>
            )}
            {locked && <Label muted>{tr('analysis.locked')}</Label>}
            {unavailable && <Label muted>{serverText(engine.state.error?.message)}</Label>}
            {!engine.state.connected && engineOn && <Label muted>{tr('analysis.connecting')}</Label>}
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
            <Label bold>{tr('analysis.moves')}</Label>
            {line.length === 0 ? (
              <Label muted>{tr('analysis.empty')}</Label>
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
              <Button variant="secondary" title={showImport ? tr('common.close') : tr('analysis.import')} onPress={() => setShowImport((s) => !s)} />
              {line.length > 0 && (
                <Button
                  variant="secondary"
                  title={tr('analysis.review')}
                  onPress={() => router.push({ pathname: '/review', params: { moves: line.join(','), initialFen: start } })}
                />
              )}
              {line.length > 0 && (
                <Button
                  variant="secondary"
                  title={tr('analysis.clear')}
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
                  placeholder={tr('analysis.placeholder')}
                  placeholderTextColor={t.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
                />
                {importError && <Label muted>{importError}</Label>}
                <Button title={tr('analysis.load')} onPress={doImport} disabled={!importText.trim()} />
              </>
            )}
            <Text selectable style={{ color: t.muted, fontSize: 12 }}>
              FEN: {fen}
            </Text>
          </Card>
        </ScrollView>
      </View>
      <EngineSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} engineOn={engineOn} onEngineOn={setEngineOn} />
    </Screen>
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
  return translate(t === 'checkmate' ? 'analysis.checkmate' : t === 'stalemate' ? 'analysis.stalemate' : 'play.result.draw');
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
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  gear: { width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  // `direction` goes inline: StyleSheet.create rejects it on the web.
  boardRow: { flexDirection: 'row', gap: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginStart: 'auto' },
  pvRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  pvScore: { fontWeight: '700', minWidth: 54, textAlign: 'center', paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  moves: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  moveChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  input: { minHeight: 90, borderWidth: 1, borderRadius: 10, padding: 10, textAlignVertical: 'top', fontSize: 14 },
});
