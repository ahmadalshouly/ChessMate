import { Game, START_FEN, gameToPgn, openingTimeline, viewerOutcome, type ArchivedGame, type Color, type PlayedMove } from '@chessmate/core';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { SideDot, formatDate, gameMeta, playerLabel } from '@/components/archive';
import { Button, Card, Label, Screen } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { translate, translateOr, useT } from '@/i18n';
import { deleteGame } from '@/lib/archive';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';
import { canDownload, copyText, downloadPgn, pgnFileName, sharePgn } from '@/lib/share';


function resultLine(g: ArchivedGame): string {
  if (g.result === '*') return translate('games.replay.unfinished');
  const o = viewerOutcome(g);
  const head =
    o === 'win'
      ? translate('play.result.won')
      : o === 'loss'
        ? translate('play.result.lost')
        : g.result === '1/2-1/2'
          ? translate('play.result.draw')
          : translate('games.replay.playerWon', { name: g.result === '1-0' ? g.white : g.black });
  return `${head}${g.reason ? ` · ${translateOr(`games.reason.${g.reason}`, g.reason)}` : ''}`;
}

/**
 * Replay of a finished game: board, move list, openings, PGN, and Review with
 * the engine. Used for your saved games and for any player's games opened
 * from a profile (`deletable` false: those are not yours to delete).
 */
export function GameReplay({ game, deletable = true }: { game: ArchivedGame; deletable?: boolean }) {
  const t = useTheme();
  const tr = useT();
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
    const ok = await sharePgn(pgn, tr('games.vsPlayers', { white: game.white, black: game.black }));
    if (Platform.OS === 'web' && ok) setNotice(tr('games.replay.pgnCopied'));
  };

  const Move = ({ p }: { p: number | null }) => {
    if (p === null) return <Text style={[styles.move, { color: t.muted }]}>…</Text>;
    const active = p === ply;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('games.replay.goTo', { move: history[p - 1]!.san })}
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
      <Stack.Screen options={{ title: tr('games.vsPlayers', { white: game.white, black: game.black }) }} />
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
            <View style={[styles.controls, { direction: 'ltr' }]}>
              <Ctl label="⏮" a11y={tr('common.nav.first')} disabled={ply === 0} onPress={() => (setAutoplay(false), go(0))} />
              <Ctl label="◀" a11y={tr('common.nav.previous')} disabled={ply === 0} onPress={() => (setAutoplay(false), go(ply - 1))} />
              <Ctl
                label={autoplay ? '❚❚' : '▶︎▶︎'}
                a11y={autoplay ? tr('common.nav.pause') : tr('common.nav.playThrough')}
                disabled={history.length === 0}
                onPress={() => {
                  if (!autoplay && ply >= history.length) setPly(0);
                  setAutoplay((a) => !a);
                }}
              />
              <Ctl label="▶" a11y={tr('common.nav.next')} disabled={ply >= history.length} onPress={() => (setAutoplay(false), go(ply + 1))} />
              <Ctl label="⏭" a11y={tr('common.nav.last')} disabled={ply >= history.length} onPress={() => (setAutoplay(false), go(history.length))} />
              <Ctl label="⇅" a11y={tr('common.flipBoard')} onPress={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} />
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
                    ? tr('games.replay.customStart')
                    : ply === 0
                      ? tr('games.replay.start')
                      : tr('games.replay.unknownOpening')}
              </Label>
            </Card>

            <Card>
              <View style={styles.moveHeader}>
                <Label bold>{tr('analysis.moves')}</Label>
                <Label muted>
                  {ply}/{history.length}
                </Label>
              </View>
              {history.length === 0 ? (
                <Label muted>{tr('games.replay.noMoves')}</Label>
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
              <Label bold>{tr('games.replay.share')}</Label>
              <View style={styles.actions}>
                <View style={styles.flex}>
                  <Button title={Platform.OS === 'web' ? tr('games.replay.shareCopyPgn') : tr('games.replay.sharePgn')} onPress={share} />
                </View>
                {canDownload && (
                  <View style={styles.flex}>
                    <Button variant="secondary" title={tr('games.replay.download')} onPress={() => downloadPgn(pgn, pgnFileName(game.white, game.black, game.endedAt))} />
                  </View>
                )}
              </View>
              {Platform.OS === 'web' && (
                <Button
                  variant="secondary"
                  title={tr('games.replay.copyFen')}
                  onPress={async () => setNotice((await copyText(fen)) ? tr('games.replay.fenCopied') : tr('games.replay.copyUnavailable'))}
                />
              )}
              {notice && <Label muted>{notice}</Label>}
              <Label muted>{tr('games.replay.played', { date: formatDate(game.endedAt) })}</Label>
              {history.length > 0 && (
                <Button
                  title={tr('analysis.review')}
                  onPress={() =>
                    router.push({
                      pathname: '/review',
                      params: { gameId: game.source === 'online' ? game.id : undefined, moves: game.moves.join(','), initialFen: game.initialFen, orientation, white: game.white, black: game.black },
                    })
                  }
                />
              )}
              {deletable && <Button
                variant={confirmDelete ? 'danger' : 'secondary'}
                title={confirmDelete ? tr('games.replay.confirmDelete') : tr('games.replay.delete')}
                onPress={async () => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  await deleteGame(game.id);
                  router.replace('/games');
                }}
              />}
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
