import Ionicons from '@expo/vector-icons/Ionicons';
import { IMMORTAL_GAMES, IMMORTAL_PLAYERS, IMMORTAL_THEMES, immortalOfTheDay, type ImmortalTheme } from '@chessmate/core';
import { Stack as RouterStack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { GameCard, GameThumb, LegendCard, openGame, placeLine, playersLine } from '@/features/immortals/ImmortalCards';
import { useI18n, useT } from '@/i18n';
import { Button, Chip, GlassView, Row, Screen, SectionHeader, Stack, Text, useAppTheme } from '@/ui';

/** The Immortals hall of fame: a game of the day, the legends, and every famous game by theme. */
export default function ImmortalsScreen() {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const { lang } = useI18n();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [theme, setTheme] = useState<ImmortalTheme | 'all'>('all');
  const today = useMemo(() => immortalOfTheDay(), []);
  const games = theme === 'all' ? IMMORTAL_GAMES : IMMORTAL_GAMES.filter((g) => g.themes.includes(theme));
  // Only offer themes that have games.
  const themes = IMMORTAL_THEMES.filter((th) => IMMORTAL_GAMES.some((g) => g.themes.includes(th)));
  const featuredSize = wide ? 280 : Math.min(320, Math.floor((width - 64) / 8) * 8);

  return (
    <Screen scroll width="wide">
      <RouterStack.Screen options={{ title: tr('immortals.title') }} />

      <GlassView strength="strong" padding="xl" radius="xl" style={{ gap: t.space.md }}>
        <Row gap="md">
          <View style={[styles.circle, { backgroundColor: c.surfaceSunken, borderColor: c.glassBorder }]}>
            <Ionicons name="infinite" size={26} color={c.text} />
          </View>
          <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
            <Text variant="overline" tone="muted">
              {tr('immortals.overline')}
            </Text>
            <Text variant="title">{tr('immortals.title')}</Text>
          </Stack>
        </Row>
        <Text tone="muted">{tr('immortals.subtitle')}</Text>
        <Text variant="caption" tone="tertiary">
          {tr('immortals.stats', { players: IMMORTAL_PLAYERS.length, games: IMMORTAL_GAMES.length })}
        </Text>
        {lang !== 'en' ? (
          <Text variant="caption" tone="muted">
            {tr('immortals.englishOnly')}
          </Text>
        ) : null}
      </GlassView>

      <GlassView padding="lg" radius="xl" style={{ gap: t.space.lg }}>
        <View style={[styles.featured, wide && styles.featuredWide]}>
          <View style={{ borderRadius: 10, overflow: 'hidden', alignSelf: 'center' }} pointerEvents="none">
            <GameThumb game={today} size={featuredSize} />
          </View>
          <Stack gap="sm" style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
            <Row gap="xs">
              <Ionicons name="sparkles" size={14} color={c.muted} />
              <Text variant="overline" tone="muted">
                {tr('immortals.ofTheDay')}
              </Text>
            </Row>
            <Text variant="title">{today.title}</Text>
            <Text tone="muted">{playersLine(today)}</Text>
            <Text variant="caption" tone="tertiary">
              {placeLine(today)}
            </Text>
            <Text>{today.summary}</Text>
            <Button title={tr('immortals.replay')} leftIcon={<Ionicons name="play" size={16} color={c.onAccent} />} onPress={() => openGame(today.id)} style={{ alignSelf: wide ? 'flex-start' : 'stretch', marginTop: t.space.xs }} />
          </Stack>
        </View>
      </GlassView>

      <Stack gap="md">
        <SectionHeader index={1} title={tr('immortals.legends')} action={<Text variant="caption" tone="tertiary">{IMMORTAL_PLAYERS.length}</Text>} />
        <View style={styles.grid}>
          {IMMORTAL_PLAYERS.map((p) => (
            <LegendCard key={p.id} player={p} wide={wide} />
          ))}
        </View>
      </Stack>

      <Stack gap="md">
        <SectionHeader index={2} title={tr('immortals.games')} action={<Text variant="caption" tone="tertiary">{games.length}</Text>} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={tr('immortals.all')} selected={theme === 'all'} onPress={() => setTheme('all')} />
          {themes.map((th) => (
            <Chip key={th} label={tr(`immortals.theme.${th}`)} selected={theme === th} onPress={() => setTheme(th)} />
          ))}
        </ScrollView>
        <View style={styles.grid}>
          {games.map((g) => (
            <GameCard key={g.id} game={g} wide={wide} />
          ))}
        </View>
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  circle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  featured: { gap: 16 },
  featuredWide: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chips: { gap: 8, paddingVertical: 2 },
});
