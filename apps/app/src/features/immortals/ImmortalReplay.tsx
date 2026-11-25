import Ionicons from '@expo/vector-icons/Ionicons';
import {
  analysisPath,
  immortalGamePath,
  immortalGamePgn,
  immortalLine,
  immortalMoments,
  immortalOrientation,
  immortalPlayer,
  immortalYear,
  pathWithQuery,
  type Color,
  type ImmortalGame,
  type Square,
} from '@chessmate/core';
import { Stack as RouterStack, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { Board } from '@/components/Board';
import { ActionBar } from '@/components/game/ActionBar';
import { useReviewEntry } from '@/features/engine/useReviewEntry';
import { ShareGameButton, ShareGameSheet, type GameShare } from '@/features/share/ShareGame';
import { dirIcon, useI18n, useT } from '@/i18n';
import { canDownload, downloadPgn } from '@/lib/share';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { useFillHeight, useWideBoard } from '@/lib/useWideBoard';
import { Avatar, Badge, Button, GlassView, Row, Screen, Stack, Text, fonts, useAppTheme } from '@/ui';

import { openPlayer } from './ImmortalCards';

/** Width of the story panel beside the board on wide screens. */
const PANEL = 400;
/** Autoplay pace: a normal move, and a key moment (long enough to read its note). */
const STEP_MS = 1100;
const MOMENT_MS = 4200;
/** Height of one numbered row in the move list. */
const ROW_H = 32;

/** What the Share button offers for a famous game: a link to this page and the full PGN. */
export function immortalShare(game: ImmortalGame): GameShare {
  return { title: game.title, link: immortalGamePath(game.id), pgn: () => immortalGamePgn(game) };
}

/**
 * Replay of a famous game with its story. The board starts at the first move
 * (these are games to watch unfold); key moments are marked in the move list
 * and their notes appear when the replay reaches them.
 */
export function ImmortalReplay({ game, initialPly }: { game: ImmortalGame; initialPly?: number }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const { lang } = useI18n();
  const { wide, size } = useWideBoard({ panel: PANEL, reserve: 190, phoneReserve: 300 });
  const [fillH, onFill] = useFillHeight();
  const line = useMemo(() => immortalLine(game), [game]);
  const moments = useMemo(() => immortalMoments(game), [game]);
  const momentAt = useMemo(() => new Map(moments.map((m) => [m.ply, m])), [moments]);
  const total = line.uci.length;
  const [ply, setPly] = useState(() => Math.max(0, Math.min(total, initialPly ?? 0)));
  const [orientation, setOrientation] = useState<Color>(() => immortalOrientation(game));
  const [autoplay, setAutoplay] = useState(false);
  const [sharing, setSharing] = useState(false);
  const share = useMemo(() => immortalShare(game), [game]);
  const reviewEntry = useReviewEntry({ moves: line.uci });

  const go = (p: number) => setPly(Math.max(0, Math.min(total, p)));

  // Arrow keys / Home / End on the web and hardware keyboards, as on the other replays.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1));
      else if (e.key === 'ArrowRight') setPly((p) => Math.min(total, p + 1));
      else if (e.key === 'Home' || e.key === 'ArrowUp') setPly(0);
      else if (e.key === 'End' || e.key === 'ArrowDown') setPly(total);
      else if (e.key === 'f') setOrientation((o) => (o === 'w' ? 'b' : 'w'));
      else return;
      e.preventDefault();
      setAutoplay(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

  // Autoplay lingers on key moments so their notes can be read, and stops at the last move.
  const playing = autoplay && ply < total;
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => setPly((p) => p + 1), momentAt.has(ply) ? MOMENT_MS : STEP_MS);
    return () => clearTimeout(id);
  }, [playing, ply, momentAt]);

  const fen = line.fens[ply]!;
  const last = ply > 0 ? line.uci[ply - 1]! : null;
  const moment = momentAt.get(ply) ?? null;
  const top: Color = orientation === 'w' ? 'b' : 'w';
  const name = (side: Color) => (side === 'w' ? game.white : game.black);
  const legendOf = (side: Color) => game.legends.map((id) => immortalPlayer(id)).find((p) => p && p.name === name(side)) ?? null;
  const stop = () => setAutoplay(false);

  const board = (
    <View style={{ width: size, gap: 8 }}>
      <PlayerBar name={name(top)} side={top} legend={!!legendOf(top)} onPress={legendOf(top) ? () => openPlayer(legendOf(top)!.id) : undefined} />
      <Board
        fen={fen}
        orientation={orientation}
        size={size}
        lastMove={last ? { from: last.slice(0, 2) as Square, to: last.slice(2, 4) as Square } : null}
        checkSquare={checkSquareOf(fen)}
        highlighted={moment && last ? [last.slice(2, 4) as Square] : undefined}
      />
      <PlayerBar name={name(orientation)} side={orientation} legend={!!legendOf(orientation)} onPress={legendOf(orientation) ? () => openPlayer(legendOf(orientation)!.id) : undefined} />
      <ActionBar
        actions={[
          { key: 'first', icon: dirIcon('page-first'), label: tr('review.first'), onPress: () => (stop(), go(0)), disabled: ply === 0 },
          { key: 'prev', icon: dirIcon('chevron-left'), label: tr('review.prev'), onPress: () => (stop(), go(ply - 1)), disabled: ply === 0, repeat: true },
          {
            key: 'play',
            icon: playing ? 'pause' : 'play',
            label: playing ? tr('review.pause') : tr('review.play'),
            active: playing,
            onPress: () => {
              if (playing) return setAutoplay(false);
              if (ply >= total) setPly(0);
              setAutoplay(true);
            },
          },
          { key: 'next', icon: dirIcon('chevron-right'), label: tr('review.next'), onPress: () => (stop(), go(ply + 1)), disabled: ply >= total, repeat: true },
          { key: 'last', icon: dirIcon('page-last'), label: tr('review.last'), onPress: () => (stop(), go(total)), disabled: ply >= total },
          { key: 'flip', icon: 'swap-vertical', label: tr('review.flip'), onPress: () => setOrientation((o) => (o === 'w' ? 'b' : 'w')) },
        ]}
      />
    </View>
  );

  const panel = (
    <View style={{ width: wide ? PANEL : size, gap: 12 }}>
      <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
        <Text variant="title">{game.title}</Text>
        <Text tone="muted">{`${game.white} – ${game.black}`}</Text>
        <Text variant="caption" tone="tertiary">
          {[game.event, game.site, String(immortalYear(game)), game.round ? tr('immortals.game.round', { round: game.round }) : null].filter(Boolean).join(' · ')}
        </Text>
        <Row gap="xs" style={{ flexWrap: 'wrap' }}>
          <Badge label={game.result.replaceAll('1/2', '½')} tone="solid" />
          {game.themes.map((th) => (
            <Badge key={th} label={tr(`immortals.theme.${th}`)} />
          ))}
        </Row>
      </GlassView>

      {/* The note for the move on the board, when it is one of the key moments. */}
      {moment ? (
        <GlassView padding="lg" radius="xl" strength="strong" style={{ gap: t.space.xs, borderColor: c.borderStrong, borderWidth: StyleSheet.hairlineWidth }}>
          <Row gap="xs">
            <Ionicons name="sparkles" size={14} color={c.text} />
            <Text variant="overline">{tr('immortals.game.moment')}</Text>
            <Text variant="caption" tone="muted" style={styles.mono}>
              {moment.at}
            </Text>
          </Row>
          <Text>{moment.note}</Text>
        </GlassView>
      ) : null}

      <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
        <Row gap="xs" justify="space-between">
          <Text variant="overline" tone="muted">
            {tr('analysis.moves')}
          </Text>
          <Text variant="caption" tone="muted" style={styles.mono}>
            {ply}/{total}
          </Text>
        </Row>
        <MoveList san={line.san} ply={ply} moments={momentAt} onPick={(p) => (stop(), go(p))} />
      </GlassView>

      <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
        <Text variant="overline" tone="muted">
          {tr('immortals.game.story')}
        </Text>
        {game.story.map((para, i) => (
          <Text key={i}>{para}</Text>
        ))}
        {lang !== 'en' ? (
          <Text variant="caption" tone="muted">
            {tr('immortals.englishOnly')}
          </Text>
        ) : null}
      </GlassView>

      <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
        <Text variant="overline" tone="muted">
          {tr('immortals.game.moments')}
        </Text>
        {moments.map((m) => {
          const active = m.ply === ply;
          return (
            <Pressable
              key={m.ply}
              accessibilityRole="button"
              accessibilityLabel={`${m.at}: ${m.note}`}
              onPress={() => (stop(), go(m.ply))}
              style={({ pressed }) => [styles.momentRow, { backgroundColor: active ? c.accent : pressed ? c.surfacePressed : 'transparent' }]}>
              <Text variant="label" style={[styles.mono, styles.momentMove, { color: active ? c.onAccent : c.text }]}>
                {m.at}
              </Text>
              <Text variant="caption" style={{ flex: 1, color: active ? c.onAccent : c.muted }} numberOfLines={active ? undefined : 2}>
                {m.note}
              </Text>
            </Pressable>
          );
        })}
      </GlassView>

      <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
        <Button
          title={tr('immortals.game.openAnalysis')}
          leftIcon={<Ionicons name="analytics-outline" size={16} color={c.onAccent} />}
          onPress={() => router.push(pathWithQuery(analysisPath({ moves: line.uci, ply })) as never)}
        />
        <Button
          variant="secondary"
          title={reviewEntry.label ?? tr('analysis.review')}
          onPress={() =>
            reviewEntry.press(() =>
              router.push({ pathname: '/review', params: { moves: line.uci.join(','), orientation, white: game.white, black: game.black, result: game.result } }),
            )
          }
        />
        <Row gap="sm" style={{ flexWrap: 'wrap' }}>
          <Button variant="secondary" title={tr('share.button')} onPress={() => setSharing(true)} style={styles.flex} />
          {canDownload ? (
            <Button variant="secondary" title={tr('games.replay.download')} onPress={() => downloadPgn(immortalGamePgn(game), `${game.id}.pgn`)} style={styles.flex} />
          ) : null}
        </Row>
      </GlassView>

      <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
        <Text variant="overline" tone="muted">
          {tr('immortals.game.legends')}
        </Text>
        {game.legends.map((id) => {
          const p = immortalPlayer(id);
          if (!p) return null;
          return (
            <Pressable key={id} accessibilityRole="link" accessibilityLabel={p.name} onPress={() => openPlayer(id)} style={({ pressed }) => [styles.legendRow, pressed && { backgroundColor: c.surfacePressed }]}>
              <Avatar name={p.name} size={36} />
              <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {p.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {p.tagline}
                </Text>
              </Stack>
              <Ionicons name={dirIcon('chevron-forward')} size={16} color={c.muted} />
            </Pressable>
          );
        })}
        <Button variant="ghost" title={tr('immortals.game.back')} onPress={() => router.dismissTo('/immortals')} />
      </GlassView>
    </View>
  );

  return (
    <Screen width="full">
      <RouterStack.Screen options={{ title: game.title, headerRight: () => <ShareGameButton share={share} /> }} />
      {wide ? (
        <View style={styles.wide} onLayout={onFill}>
          <View style={{ paddingTop: 12 }}>{board}</View>
          <ScrollView style={{ flexGrow: 0, width: PANEL, alignSelf: 'stretch', height: fillH }} contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}>
            {panel}
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.phone}>
          {board}
          {panel}
        </ScrollView>
      )}
      <ShareGameSheet visible={sharing} onClose={() => setSharing(false)} share={share} />
    </Screen>
  );
}

/** Name above or below the board; legends link to their page. */
function PlayerBar({ name, side, legend, onPress }: { name: string; side: Color; legend: boolean; onPress?: () => void }) {
  const c = useAppTheme().colors;
  return (
    <Pressable accessibilityRole={onPress ? 'link' : undefined} disabled={!onPress} onPress={onPress} style={styles.playerRow}>
      <View style={[styles.dot, { backgroundColor: side === 'w' ? '#f4f4f4' : '#1d1d1d', borderColor: c.borderStrong }]} />
      <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
        {name}
      </Text>
      {legend ? <Ionicons name="star" size={12} color={c.muted} /> : null}
    </Pressable>
  );
}

/** Numbered move pairs; key moments are bold with a dot, the current move is filled. */
function MoveList({ san, ply, moments, onPick }: { san: string[]; ply: number; moments: Map<number, unknown>; onPick: (p: number) => void }) {
  const c = useAppTheme().colors;
  const list = useRef<ScrollViewInstance>(null);
  // Keep the current move in view, a few rows from the top.
  useEffect(() => {
    list.current?.scrollTo({ y: Math.max(0, (Math.ceil(ply / 2) - 4) * ROW_H), animated: true });
  }, [ply]);
  const rows: { no: number; w: number; b: number | null }[] = [];
  for (let p = 1, no = 1; p <= san.length; p += 2, no++) rows.push({ no, w: p, b: p + 1 <= san.length ? p + 1 : null });
  const cell = (p: number | null) => {
    if (p === null) return <View style={styles.moveCell} />;
    const active = p === ply;
    const key = moments.has(p);
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={san[p - 1]} onPress={() => onPick(p)} style={[styles.moveCell, active && { backgroundColor: c.accent }]}>
        <Row gap="xxs">
          <Text style={[styles.move, { color: active ? c.onAccent : c.text, fontFamily: key ? fonts.sansSemiBold : fonts.sans }]}>{san[p - 1]}</Text>
          {key ? <View style={[styles.keyDot, { backgroundColor: active ? c.onAccent : c.text }]} /> : null}
        </Row>
      </Pressable>
    );
  };
  return (
    // Move pairs read left to right in every language, like the board.
    <ScrollView ref={list} style={styles.moveList} nestedScrollEnabled>
      {rows.map((r) => (
        <View key={r.no} style={[styles.moveRow, { direction: 'ltr' }]}>
          <Text style={[styles.moveNo, { color: c.muted }]}>{r.no}.</Text>
          {cell(r.w)}
          {cell(r.b)}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wide: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 24, paddingHorizontal: 16, minHeight: 0 },
  phone: { alignItems: 'center', gap: 12, padding: 12, paddingBottom: 48 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  mono: { fontFamily: fonts.mono },
  momentRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, alignItems: 'flex-start' },
  momentMove: { width: 86 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: 14 },
  flex: { flexGrow: 1, flexBasis: 140 },
  moveList: { maxHeight: 260 },
  moveRow: { flexDirection: 'row', alignItems: 'center', height: ROW_H },
  moveNo: { width: 40, fontSize: 14, fontVariant: ['tabular-nums'] },
  moveCell: { flex: 1, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  move: { fontSize: 15 },
  keyDot: { width: 5, height: 5, borderRadius: 3 },
});
