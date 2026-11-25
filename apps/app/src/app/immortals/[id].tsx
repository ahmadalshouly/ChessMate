import Ionicons from '@expo/vector-icons/Ionicons';
import { IMMORTAL_PLAYERS, immortalGamesOf, immortalPlayer } from '@chessmate/core';
import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { GameCard, openPlayer, useLifespan } from '@/features/immortals/ImmortalCards';
import { dirIcon, useI18n, useT } from '@/i18n';
import { Avatar, Badge, Button, GlassView, Row, Screen, SectionHeader, Stack, Text, useAppTheme } from '@/ui';

/** One legend: who they were, and the famous games they played. */
export default function ImmortalPlayerScreen() {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const { lang } = useI18n();
  const lifespan = useLifespan();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { id } = useLocalSearchParams<{ id: string }>();
  const player = id ? immortalPlayer(String(id)) : null;

  if (!player) {
    return (
      <Screen scroll>
        <RouterStack.Screen options={{ title: tr('immortals.title') }} />
        <GlassView padding="xl" radius="xl" style={{ gap: t.space.md }}>
          <Text variant="heading">{tr('immortals.player.notFound')}</Text>
          <Button title={tr('immortals.player.back')} onPress={() => router.dismissTo('/immortals')} />
        </GlassView>
      </Screen>
    );
  }

  const games = immortalGamesOf(player.id);
  // The next legend in the hall, for reading on without going back.
  const at = IMMORTAL_PLAYERS.findIndex((p) => p.id === player.id);
  const next = IMMORTAL_PLAYERS[(at + 1) % IMMORTAL_PLAYERS.length]!;

  return (
    <Screen scroll width="wide">
      <RouterStack.Screen options={{ title: player.name }} />

      <GlassView strength="strong" padding="xl" radius="xl" style={{ gap: t.space.lg }}>
        <Row gap="lg" align="center">
          <Avatar name={player.name} size={wide ? 84 : 64} />
          <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
            <Text variant="overline" tone="muted">
              {tr('immortals.overline')}
            </Text>
            <Text variant="title">{player.name}</Text>
            <Text tone="muted">{player.tagline}</Text>
          </Stack>
        </Row>
        <Row gap="xs" style={{ flexWrap: 'wrap' }}>
          {player.worldChampion ? <Badge size="md" label={tr('immortals.champion')} tone="solid" icon={<Ionicons name="trophy" size={12} color={c.onAccent} />} /> : null}
          <Badge size="md" label={lifespan(player)} tone="outline" />
        </Row>
        <Text variant="caption" tone="muted">
          {[tr('immortals.bornIn', { year: player.born, place: player.birthplace }), player.worldChampion ? tr('immortals.worldChampion', { years: player.worldChampion }) : null].filter(Boolean).join(' · ')}
        </Text>
        <Stack gap="md" style={{ maxWidth: 760 }}>
          {player.bio.map((para, i) => (
            <Text key={i}>{para}</Text>
          ))}
        </Stack>
        {lang !== 'en' ? (
          <Text variant="caption" tone="muted">
            {tr('immortals.englishOnly')}
          </Text>
        ) : null}
      </GlassView>

      <Stack gap="md">
        <SectionHeader title={tr('immortals.player.games')} action={<Text variant="caption" tone="tertiary">{games.length}</Text>} />
        <View style={styles.grid}>
          {games.map((g) => (
            <GameCard key={g.id} game={g} wide={wide} forPlayer={player.id} />
          ))}
        </View>
      </Stack>

      <Row gap="sm" style={{ flexWrap: 'wrap' }}>
        <Button variant="secondary" title={tr('immortals.player.back')} onPress={() => router.dismissTo('/immortals')} />
        <Button variant="ghost" title={next.name} rightIcon={<Ionicons name={dirIcon('arrow-forward')} size={16} color={c.text} />} onPress={() => openPlayer(next.id)} />
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
