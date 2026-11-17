import { PUZZLE_THEME_GROUPS, type PuzzleDto, type PuzzleProfileDto } from '@chessmate/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Board } from '@/components/Board';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { puzzleApi } from '@/lib/puzzleApi';
import { useT } from '@/i18n';
import { puzzleGroupLabel, puzzleThemeLabel } from '@/i18n/chess';

/** Puzzles home: rating, daily puzzle, themed training, streak and rush. */
export default function PuzzlesHome() {
  const t = useTheme();
  const tr = useT();
  const [profile, setProfile] = useState<PuzzleProfileDto | null>(null);
  const [daily, setDaily] = useState<{ puzzle: PuzzleDto; attempted: boolean } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [theme, setTheme] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      Promise.all([puzzleApi.profile(), puzzleApi.daily().catch(() => null), puzzleApi.themes()])
        .then(([p, d, th]) => {
          if (!live) return;
          setProfile(p);
          setDaily(d);
          setCounts(th.counts);
          setError(null);
        })
        .catch((e) => live && setError(e instanceof Error ? e.message : tr('puzzles.home.unreachable')));
      return () => {
        live = false;
      };
    }, []),
  );

  const groups = PUZZLE_THEME_GROUPS.map((g) => ({ ...g, themes: Object.entries(g.themes).filter(([k]) => (counts[k] ?? 0) > 0) })).filter((g) => g.themes.length > 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          <Label size={28} bold>
            {tr('nav.puzzles')}
          </Label>
          {error && (
            <Card>
              <Label bold>{tr('play.offline')}</Label>
              <Label muted>{error}</Label>
            </Card>
          )}

          <Card>
            <View style={styles.stats}>
              <Stat label={tr('puzzles.home.rating')} value={profile ? `${profile.rating}${profile.provisional ? '?' : ''}` : '–'} />
              <Stat label={tr('puzzles.home.solved')} value={profile ? `${profile.solved}/${profile.attempts}` : '–'} />
              <Stat label={tr('puzzles.home.bestStreak')} value={profile ? String(profile.bestStreak) : '–'} />
              <Stat label={tr('puzzles.home.bestRush')} value={profile ? String(profile.bestRush) : '–'} />
            </View>
          </Card>

          {daily && (
            <Card>
              <View style={styles.daily}>
                <Board fen={daily.puzzle.fen} orientation={daily.puzzle.fen.split(' ')[1] === 'w' ? 'b' : 'w'} size={112} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Label size={18} bold>
                    {tr('puzzles.daily')}
                  </Label>
                  <Label muted>{daily.attempted ? tr('puzzles.home.dailyDone') : tr('puzzles.home.dailyNew')}</Label>
                  <Button title={daily.attempted ? tr('puzzles.home.replay') : tr('puzzles.home.solve')} onPress={() => router.push({ pathname: '/puzzles/train', params: { daily: '1' } })} />
                </View>
              </View>
            </Card>
          )}

          <Card>
            <Label size={18} bold>
              {tr('puzzles.home.train')}
            </Label>
            <Label muted>{tr('puzzles.home.trainBody')}</Label>
            {groups.map((g) => (
              <View key={g.title} style={{ gap: 6 }}>
                <Label muted size={13} bold>
                  {puzzleGroupLabel(g.title).toLocaleUpperCase()}
                </Label>
                <View style={styles.chips}>
                  {g.themes.map(([key]) => {
                    const on = theme === key;
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => setTheme(on ? null : key)}
                        style={[styles.chip, { borderColor: on ? t.accent : t.glassBorder, backgroundColor: on ? t.accent : t.surface }]}>
                        <Text style={{ color: on ? t.onAccent : t.text, fontSize: 14, fontWeight: '600' }}>{puzzleThemeLabel(key)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            <Button title={theme ? tr('puzzles.home.startThemed') : tr('puzzles.home.start')} onPress={() => router.push({ pathname: '/puzzles/train', params: theme ? { theme } : {} })} />
          </Card>

          <View style={styles.modes}>
            <Card style={styles.mode}>
              <Label size={18} bold>
                {tr('puzzles.home.streak')}
              </Label>
              <Label muted>{tr('puzzles.home.streakBody')}</Label>
              <Button variant="secondary" title={tr('puzzles.home.playStreak')} onPress={() => router.push({ pathname: '/puzzles/run', params: { mode: 'streak' } })} />
            </Card>
            <Card style={styles.mode}>
              <Label size={18} bold>
                {tr('puzzles.home.rush')}
              </Label>
              <Label muted>{tr('puzzles.home.rushBody')}</Label>
              <Button variant="secondary" title={tr('puzzles.home.playRush')} onPress={() => router.push({ pathname: '/puzzles/run', params: { mode: 'rush' } })} />
            </Card>
          </View>

          <Label muted size={12}>
            {tr('puzzles.home.credit')}
          </Label>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Label size={22} bold>
        {value}
      </Label>
      <Label muted size={12}>
        {label}
      </Label>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  stat: { width: '50%', minWidth: 120, flexGrow: 1, flexBasis: 120 },
  daily: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  mode: { flexGrow: 1, flexBasis: 240 },
});
