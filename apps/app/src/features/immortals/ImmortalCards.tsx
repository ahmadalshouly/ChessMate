import Ionicons from '@expo/vector-icons/Ionicons';
import {
  immortalGamesOf,
  immortalLine,
  immortalOutcome,
  immortalOrientation,
  immortalThumb,
  immortalYear,
  type ImmortalGame,
  type ImmortalPlayer,
  type Square,
} from '@chessmate/core';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BoardThumb } from '@/components/Board';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { dirIcon, useT } from '@/i18n';
import { Avatar, Badge, GlassView, Row, Stack, Text, useAppTheme } from '@/ui';

/** "1936–1992", or "Born 1990" for the living. */
export function useLifespan() {
  const tr = useT();
  return (p: ImmortalPlayer) => (p.died == null ? tr('immortals.alive', { born: p.born }) : tr('immortals.lifespan', { born: p.born, died: p.died }));
}

export const openPlayer = (id: string) => router.push({ pathname: '/immortals/[id]', params: { id } });
export const openGame = (id: string) => router.push({ pathname: '/immortals/game/[id]', params: { id } });

/** "Morphy – Paulsen"-style line: the full names of both players. */
export function playersLine(g: ImmortalGame): string {
  return `${g.white} – ${g.black}`;
}

/** "Hastings · 1895". */
export function placeLine(g: ImmortalGame): string {
  return `${g.site} · ${immortalYear(g)}`;
}

/**
 * A position from the game, small and still: its key position from the
 * precomputed table, or the position at `ply` when one is passed. With
 * `ready` false it is an empty square of the same size, so a list can paint
 * its text first and fill the boards in just after (see useRevealCount).
 */
export const GameThumb = memo(function GameThumb({ game, size, ply, ready = true }: { game: ImmortalGame; size: number; ply?: number; ready?: boolean }) {
  const { colors } = useAppTheme();
  if (!ready) return <View style={{ width: size, height: size, backgroundColor: colors.surfaceSunken }} />;
  const view = thumbView(game, ply);
  return <BoardThumb fen={view.fen} orientation={view.orientation} size={size} lastMove={view.lastMove} checkSquare={view.check} />;
});

/** The position a thumbnail shows: the precomputed key position, or the one at `ply`. */
function thumbView(game: ImmortalGame, ply: number | undefined) {
  const toMove = (uci: string | null) => (uci ? { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square } : null);
  if (ply === undefined) {
    const t = immortalThumb(game);
    return { fen: t.fen, orientation: t.orientation, lastMove: toMove(t.last), check: t.check };
  }
  const line = immortalLine(game);
  const at = Math.max(0, Math.min(line.uci.length, ply));
  const fen = line.fens[at]!;
  return { fen, orientation: immortalOrientation(game), lastMove: toMove(at > 0 ? line.uci[at - 1]! : null), check: checkSquareOf(fen) };
}

/** A legend in the grid: initials, name, tagline, years and how many games. */
export function LegendCard({ player, wide }: { player: ImmortalPlayer; wide: boolean }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const lifespan = useLifespan();
  const count = immortalGamesOf(player.id).length;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={player.name} onPress={() => openPlayer(player.id)} style={{ flexGrow: 1, flexBasis: wide ? 280 : '100%' }}>
      {({ pressed }) => (
        <GlassView padding="lg" radius="xl" flat style={{ flexGrow: 1, gap: t.space.sm, transform: [{ scale: pressed ? 0.985 : 1 }] }}>
          {pressed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.surfacePressed }]} />}
          <Row gap="md">
            <Avatar name={player.name} size={46} />
            <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
              <Text variant="heading" numberOfLines={1}>
                {player.name}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {player.tagline}
              </Text>
            </Stack>
            <Ionicons name={dirIcon('chevron-forward')} size={18} color={c.muted} />
          </Row>
          <Row gap="xs" style={{ flexWrap: 'wrap' }}>
            <Badge label={lifespan(player)} tone="outline" />
            {player.worldChampion ? <Badge label={tr('immortals.champion')} tone="solid" icon={<Ionicons name="trophy" size={11} color={c.onAccent} />} /> : null}
            <Badge label={tr('immortals.gameCount', { count })} />
          </Row>
        </GlassView>
      )}
    </Pressable>
  );
}

/**
 * A famous game in a list: its key position, name, players and place. Pass
 * `forPlayer` on a legend's page to show how it went for them, and
 * `boardReady` false to hold its board back for a moment.
 */
export function GameCard({ game, wide, forPlayer, boardReady = true }: { game: ImmortalGame; wide: boolean; forPlayer?: string; boardReady?: boolean }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const outcome = forPlayer ? immortalOutcome(game, forPlayer) : null;
  const thumb = wide ? 112 : 96;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={game.title} onPress={() => openGame(game.id)} style={{ flexGrow: 1, flexBasis: wide ? 420 : '100%' }}>
      {({ pressed }) => (
        <GlassView padding="md" radius="xl" flat style={{ flexGrow: 1, transform: [{ scale: pressed ? 0.985 : 1 }] }}>
          {pressed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.surfacePressed }]} />}
          <Row gap="md" align="flex-start">
            <View style={{ borderRadius: 8, overflow: 'hidden' }} pointerEvents="none">
              <GameThumb game={game} size={thumb} ready={boardReady} />
            </View>
            <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
              <Text variant="heading" numberOfLines={2}>
                {game.title}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={2}>
                {playersLine(game)}
              </Text>
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {placeLine(game)}
              </Text>
              <Row gap="xs" style={{ flexWrap: 'wrap' }}>
                {outcome ? <Badge label={tr(`immortals.outcome.${outcome}`)} tone={outcome === 'win' ? 'solid' : 'outline'} /> : <Badge label={game.result.replaceAll('1/2', '½')} tone="outline" />}
                {game.themes.slice(0, 2).map((th) => (
                  <Badge key={th} label={tr(`immortals.theme.${th}`)} />
                ))}
              </Row>
            </Stack>
          </Row>
        </GlassView>
      )}
    </Pressable>
  );
}
