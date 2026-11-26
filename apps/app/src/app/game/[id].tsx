import { timeCategory, type ArchivedGame, type Color, type GameEndReason, type GameResult } from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { GameReplay } from '@/components/GameReplay';
import { Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { apiRequest } from '@/lib/social/api';
import { Button, GlassView, Text } from '@/ui';
import { goBack } from '@/lib/goBack';

interface PublicGame {
  id: string;
  white: { userId: string | null; name: string; ratingBefore: number | null; ratingAfter: number | null };
  black: { userId: string | null; name: string; ratingBefore: number | null; ratingAfter: number | null };
  initialMs: number;
  incrementMs: number;
  rated: boolean;
  initialFen: string;
  moves: string[];
  /** The mover's clock after each move (ms); missing from older servers. */
  clocks?: (number | null)[];
  result: string;
  endReason: string | null;
  startedAt: number;
  endedAt: number | null;
}

const delta = (p: PublicGame['white']) => (p.ratingBefore !== null && p.ratingAfter !== null ? p.ratingAfter - p.ratingBefore : null);

function toArchived(g: PublicGame, side: Color | null): ArchivedGame {
  const tc = { initialMs: g.initialMs, incrementMs: g.incrementMs };
  return {
    id: g.id,
    source: 'online',
    white: g.white.name,
    black: g.black.name,
    whiteRating: g.white.ratingBefore,
    blackRating: g.black.ratingBefore,
    whiteDelta: g.rated ? delta(g.white) : null,
    blackDelta: g.rated ? delta(g.black) : null,
    myColor: side,
    timeControl: tc,
    category: timeCategory(tc),
    rated: g.rated,
    result: g.result as GameResult,
    reason: (g.endReason as GameEndReason | null) ?? null,
    initialFen: g.initialFen,
    moves: g.moves,
    ...(g.clocks?.some((c) => c != null) ? { clocks: g.clocks } : {}),
    startedAt: g.startedAt,
    endedAt: g.endedAt ?? g.startedAt,
    eco: null,
    opening: null,
  };
}

/**
 * Any finished online game, opened from a profile's recent games: replay it
 * move by move, then Review with the engine. `side` (w/b) turns the board to
 * the profile owner's side.
 */
export default function OnlineGameScreen() {
  const tr = useT();
  const { id, side, review } = useLocalSearchParams<{ id: string; side?: string; review?: string }>();
  const [game, setGame] = useState<ArchivedGame | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    apiRequest<{ game: PublicGame }>('GET', `/api/games/${encodeURIComponent(id)}`, undefined, { optionalAuth: true }).then(
      (r) => {
        if (!live) return;
        const g = toArchived(r.game, side === 'w' || side === 'b' ? side : null);
        // "Review" on a profile row goes straight to the engine review.
        if (review === '1' && g.moves.length > 0) {
          router.replace({
            pathname: '/review',
            params: { gameId: g.id, moves: g.moves.join(','), initialFen: g.initialFen, orientation: g.myColor ?? 'w', white: g.white, black: g.black, result: g.result },
          });
          return;
        }
        setGame(g);
      },
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [id, side, review]);

  if (game) return <GameReplay game={game} deletable={false} />;
  return (
    <Screen>
      <Stack.Screen options={{ title: tr('games.replay.title') }} />
      <View style={styles.page}>
        {error ? (
          <GlassView padding="lg" radius="xl" style={{ gap: 12, alignItems: 'flex-start', maxWidth: 480, width: '100%' }}>
            <Text variant="heading">{tr('games.replay.notFound')}</Text>
            <Text tone="muted">{serverText(error)}</Text>
            <Button variant="secondary" title={tr('common.back')} onPress={() => goBack('/games')} />
          </GlassView>
        ) : (
          <ActivityIndicator style={{ marginTop: 48 }} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, alignItems: 'center' },
});
