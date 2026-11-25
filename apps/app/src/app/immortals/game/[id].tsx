import { immortalGame } from '@chessmate/core';
import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';

import { ImmortalReplay } from '@/features/immortals/ImmortalReplay';
import { useT } from '@/i18n';
import { Button, GlassView, Screen, Text, useAppTheme } from '@/ui';

/** A famous game: replay it move by move with its story and key moments. `?ply=` opens on a move. */
export default function ImmortalGameScreen() {
  const t = useAppTheme();
  const tr = useT();
  const { id, ply } = useLocalSearchParams<{ id: string; ply?: string }>();
  const game = id ? immortalGame(String(id)) : null;

  if (!game) {
    return (
      <Screen scroll>
        <RouterStack.Screen options={{ title: tr('immortals.title') }} />
        <GlassView padding="xl" radius="xl" style={{ gap: t.space.md }}>
          <Text variant="heading">{tr('immortals.game.notFound')}</Text>
          <Button title={tr('immortals.game.back')} onPress={() => router.dismissTo('/immortals')} />
        </GlassView>
      </Screen>
    );
  }

  const start = ply !== undefined && ply !== '' && Number.isFinite(Number(ply)) ? Math.round(Number(ply)) : undefined;
  // Keyed by game so moving between games starts each one fresh.
  return <ImmortalReplay key={game.id} game={game} initialPly={start} />;
}
