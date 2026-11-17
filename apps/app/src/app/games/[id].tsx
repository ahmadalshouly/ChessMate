import { Game, START_FEN, gameToPgn, openingTimeline, viewerOutcome, type ArchivedGame, type Color, type PlayedMove } from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { SideDot, formatDate, gameMeta, playerLabel } from '@/components/archive';
import { Button, Card, Label, Screen } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { deleteGame, useArchivedGame } from '@/lib/archive';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';
import { canDownload, copyText, downloadPgn, pgnFileName, sharePgn } from '@/lib/share';

const REASONS: Record<string, string> = {
  checkmate: 'by checkmate',
  resignation: 'by resignation',
  timeout: 'on time',
  timeout_vs_insufficient: 'timeout vs insufficient material',
  stalemate: 'by stalemate',
  insufficient_material: 'insufficient material',
  threefold_repetition: 'threefold repetition',
  fifty_move_rule: 'fifty-move rule',
  draw_agreement: 'by agreement',
  abandoned: 'player left',
  aborted: 'game aborted',
};

export default function ReplayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { game, loading } = useArchivedGame(id);
  if (!game) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Game' }} />
        <View style={styles.page}>
          {!loading && (
            <Card>
              <Label bold>Game not found</Label>
              <Label muted>It may have been deleted from this device.</Label>
              <Button title="Back to history" onPress={() => router.replace('/games')} />
            </Card>
          )}
        </View>
      </Screen>
    );
  }
  return <Replay game={game} />;
}

function resultLine(g: ArchivedGame): string {
  if (g.result === '*') return 'Unfinished game';
  const o = viewerOutcome(g);
  const head =
    o === 'win' ? 'You won' : o === 'loss' ? 'You lost' : g.result === '1/2-1/2' ? 'Draw' : g.result === '1-0' ? `${g.white} won` : `${g.black} won`;
  return `${head}${g.reason ? ` · ${REASONS[g.reason] ?? g.reason}` : ''}`;
}

function Replay({ game }: { game: ArchivedGame }) {
  const t = useTheme();
  const size = useBoardSize(330);
  const history: PlayedMove[] = useMemo(() => Game.fromUciMoves(game.moves, game.initialFen).history(), [game]);
  const fens = useMemo(() => [game.initialFen, ...history.map((m) => m.fenAfter)], [game, history]);
  const openings = useMemo(() => openingTimeline(game.moves, game.initialFen), [game]);
  const [ply, setPly] = useState(history.length);
  const [orientation, setOrientation] = useState<Color>(game.myColor ?? 'w');
  const [autoplay, setAutoplay] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pgn = useMemo(() => gameToPgn(game), [game]);

  const go = (p: number) => setPly(Math.max(0, Math.min(history.length, p)));
  const plyRef = useRef(ply);
  plyRef.current = ply;

  // Arrow keys / Home / End on web and hardware keyboards.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const p = plyRef.current;
      if (e.key === 'ArrowLeft') setPly(Math.max(0, p - 1));
      else if (e.key === 'ArrowRight') setPly(Math.min(history.length, p + 1));
      else if (e.key === 'Home' || e.key === 'ArrowUp') setPly(0);
      else if (e.key === 'End' || e.key === 'ArrowDown') setPly(history.length);
      else if (e.key === 'f') setOrientation((o) => (o === 'w' ? 'b' : 'w'));
      else return;
      e.preventDefault();
      setAutoplay(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history.length]);

  useEffect(() => {
    if (!autoplay) return;
    if (ply >= history.length) {
      setAutoplay(false);
      return;
    }
    const id = setTimeout(() => setPly((p) => p + 1), 900);
    return () => clearTimeout(id);
  }, [autoplay, ply, history.length]);

  const fen = fens[ply]!;
  const last = ply > 0 ? history[ply - 1] : undefined;
  const opening = openings[ply] ?? null;
  const top: Color = orientation === 'w' ? 'b' : 'w';
  const name = (c: Color) => (c === 'w' ? playerLabel(game.white, game.whiteRating) : playerLabel(game.black, game.blackRating));
  const delta = (c: Color) => {
    const d = c === 'w' ? game.whiteDelta : game.blackDelta;
    return d == null ? '' : ` ${d >= 0 ? '+' : ''}${Math.round(d)}`;
  };
  const startsWithBlack = game.initialFen.split(' ')[1] === 'b';
  const firstMoveNo = Number(game.initialFen.split(' ')[5]) || 1;

  // Pair moves into rows: [moveNo, whitePly|null, blackPly|null], plies are 1-based.
  const rows = useMemo(() => {
    const out: { no: number; w: number | null; b: number | null }[] = [];
    let p = 1;
    let no = firstMoveNo;
    if (startsWithBlack && history.length) {
      out.push({ no, w: null, b: 1 });
      p = 2;
      no++;
    }
    for (; p <= history.length; p += 2, no++) out.push({ no, w: p, b: p + 1 <= history.length ? p + 1 : null });
    return out;
  }, [history.length, startsWithBlack, firstMoveNo]);

  const share = async () => {
    const ok = await sharePgn(pgn, `${game.white} vs ${game.black}`);
    if (Platform.OS === 'web' && ok) setNotice('PGN copied to clipboard.');
  };

  const Move = ({ p }: { p: number | null }) => {
    if (p === null) return <Text style={[styles.move, { color: t.muted }]}>…</Text>;
    const active = p === ply;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Go to move ${history[p - 1]!.san}`}
        onPress={() => {
          setAutoplay(false);
          go(p);
        }}
        style={[styles.moveCell, active && { backgroundColor: t.accent }]}>
        <Text style={[styles.move, { color: active ? t.onAccent : t.text }]}>{history[p - 1]!.san}</Text>
      </Pressable>
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: `${game.white} vs ${game.black}` }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={[styles.layout, { maxWidth: Math.max(size, 360) * 2 + 16 }]}>
          <View style={{ width: size, gap: 8 }}>
            <View style={styles.playerRow}>
              <SideDot color={top} />
              <Text style={[styles.player, { color: t.text }]} numberOfLines={1}>
                {name(top)}
                <Text style={{ color: t.muted }}>{delta(top)}</Text>
              </Text>
            </View>
            <Board
              fen={fen}
              orientation={orientation}
              size={size}
              lastMove={last ? { from: last.from, to: last.to } : null}
              checkSquare={checkSquareOf(fen)}
            />
            <View style={styles.playerRow}>
              <SideDot color={orientation} />
              <Text style={[styles.player, { color: t.text }]} numberOfLines={1}>
                {name(orientation)}
                <Text style={{ color: t.muted }}>{delta(orientation)}</Text>
              </Text>
            </View>
            <View style={styles.controls}>
              <Ctl label="⏮" a11y="First move" disabled={ply === 0} onPress={() => (setAutoplay(false), go(0))} />
              <Ctl label="◀" a11y="Previous move" disabled={ply === 0} onPress={() => (setAutoplay(false), go(ply - 1))} />
              <Ctl
                label={autoplay ? '❚❚' : '▶︎▶︎'}
                a11y={autoplay ? 'Pause' : 'Play through'}
                disabled={history.length === 0}
                onPress={() => {
                  if (!autoplay && ply >= history.length) setPly(0);
                  setAutoplay((a) => !a);
                }}
              />
              <Ctl label="▶" a11y="Next move" disabled={ply >= history.length} onPress={() => (setAutoplay(false), go(ply + 1))} />
              <Ctl label="⏭" a11y="Last move" disabled={ply >= history.length} onPress={() => (setAutoplay(false), go(history.length))} />
              <Ctl label="⇅" a11y="Flip board" onPress={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} />
            </View>
          </View>

          <View style={styles.side}>
            <Card>
              <Label size={18} bold>
                {resultLine(game)}
              </Label>
              <Label muted>{gameMeta(game)}</Label>
              <Label>
                {opening
                  ? `${opening.eco} · ${opening.name}`
                  : game.initialFen !== START_FEN
                    ? 'Custom starting position'
                    : ply === 0
                      ? 'Starting position'
                      : 'Opening not recognised'}
              </Label>
            </Card>

            <Card>
              <View style={styles.moveHeader}>
                <Label bold>Moves</Label>
                <Label muted>
                  {ply}/{history.length}
                </Label>
              </View>
              {history.length === 0 ? (
                <Label muted>No moves were played.</Label>
              ) : (
                <ScrollView style={styles.moveList} nestedScrollEnabled>
                  {rows.map((r) => (
                    <View key={r.no} style={styles.moveRow}>
                      <Text style={[styles.moveNo, { color: t.muted }]}>{r.no}.</Text>
                      <Move p={r.w} />
                      {r.b !== null || r.w === null ? <Move p={r.b} /> : <View style={styles.moveCell} />}
                    </View>
                  ))}
                </ScrollView>
              )}
            </Card>

            <Card>
              <Label bold>Share</Label>
              <View style={styles.actions}>
                <View style={styles.flex}>
                  <Button title={Platform.OS === 'web' ? 'Share / copy PGN' : 'Share PGN'} onPress={share} />
                </View>
                {canDownload && (
                  <View style={styles.flex}>
                    <Button variant="secondary" title="Download .pgn" onPress={() => downloadPgn(pgn, pgnFileName(game.white, game.black, game.endedAt))} />
                  </View>
                )}
              </View>
              {Platform.OS === 'web' && (
                <Button
                  variant="secondary"
                  title="Copy position (FEN)"
                  onPress={async () => setNotice((await copyText(fen)) ? 'FEN copied to clipboard.' : 'Copy is not available here.')}
                />
              )}
              {notice && <Label muted>{notice}</Label>}
              <Label muted>Played {formatDate(game.endedAt)}</Label>
              <Button
                variant={confirmDelete ? 'danger' : 'secondary'}
                title={confirmDelete ? 'Tap again to delete from this device' : 'Delete game'}
                onPress={async () => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  await deleteGame(game.id);
                  router.replace('/games');
                }}
              />
            </Card>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Ctl({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ctl,
        { backgroundColor: t.surface, borderColor: t.glassBorder, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
      ]}>
      <Text style={[styles.ctlText, { color: t.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center', paddingBottom: 48 },
  layout: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  side: { flexGrow: 1, flexBasis: 300, maxWidth: 640, gap: 12 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  player: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  controls: { flexDirection: 'row', gap: 6 },
  ctl: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  ctlText: { fontSize: 16, fontWeight: '700' },
  moveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  moveList: { maxHeight: 280 },
  moveRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 1 },
  moveNo: { width: 40, fontSize: 14, fontVariant: ['tabular-nums'] },
  moveCell: { flex: 1, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  move: { fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  flex: { flexGrow: 1, flexBasis: 140 },
});
