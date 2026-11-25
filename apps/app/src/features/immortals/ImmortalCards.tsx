import Ionicons from '@expo/vector-icons/Ionicons';
import {
  immortalGamesOf,
  immortalKeyPly,
  immortalLine,
  immortalOutcome,
  immortalOrientation,
  immortalYear,
  type ImmortalGame,
  type ImmortalPlayer,
  type Square,
} from '@chessmate/core';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Board } from '@/components/Board';
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

/** A position from the game, small and silent. */
export const GameThumb = memo(function GameThumb({ game, size, ply }: { game: ImmortalGame; size: number; ply?: number }) {
  const line = immortalLine(game);
  const at = Math.max(0, Math.min(line.uci.length, ply ?? immortalKeyPly(game)));
  const fen = line.fens[at]!;
  const last = at > 0 ? line.uci[at - 1]! : null;
  return (
    <Board
      fen={fen}
      orientation={immortalOrientation(game)}
      size={size}
      lastMove={last ? { from: last.slice(0, 2) as Square, to: last.slice(2, 4) as Square } : null}
      checkSquare={checkSquareOf(fen)}
      sound={false}
      drawable={false}
      hideCoordinates
    />
  );
});

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
 * `forPlayer` on a legend's page to show how it went for them.
 */
export function GameCard({ game, wide, forPlayer }: { game: ImmortalGame; wide: boolean; forPlayer?: string }) {
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
              <GameThumb game={game} size={thumb} />
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
