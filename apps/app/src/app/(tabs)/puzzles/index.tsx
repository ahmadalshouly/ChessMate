import { PUZZLE_THEME_GROUPS, type PuzzleDto, type PuzzleProfileDto } from '@chessmate/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { puzzleApi } from '@/lib/puzzleApi';

/** Puzzles home: rating, daily puzzle, themed training, streak and rush. */
export default function PuzzlesHome() {
  const t = useTheme();
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
        .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not reach the server'));
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
            Puzzles
          </Label>
          {error && (
            <Card>
              <Label bold>Offline</Label>
              <Label muted>{error}</Label>
            </Card>
          )}

          <Card>
            <View style={styles.stats}>
              <Stat label="Puzzle rating" value={profile ? `${profile.rating}${profile.provisional ? '?' : ''}` : '–'} />
              <Stat label="Solved" value={profile ? `${profile.solved}/${profile.attempts}` : '–'} />
              <Stat label="Best streak" value={profile ? String(profile.bestStreak) : '–'} />
              <Stat label="Best rush" value={profile ? String(profile.bestRush) : '–'} />
            </View>
          </Card>

          {daily && (
            <Card>
              <View style={styles.daily}>
                <Board fen={daily.puzzle.fen} orientation={daily.puzzle.fen.split(' ')[1] === 'w' ? 'b' : 'w'} size={112} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Label size={18} bold>
                    Daily puzzle
                  </Label>
                  <Label muted>{daily.attempted ? 'Done for today. Try it again any time.' : 'Same puzzle for everyone, new each day.'}</Label>
                  <Button title={daily.attempted ? 'Replay' : 'Solve'} onPress={() => router.push({ pathname: '/puzzles/train', params: { daily: '1' } })} />
                </View>
              </View>
            </Card>
          )}

          <Card>
            <Label size={18} bold>
              Train
            </Label>
            <Label muted>Rated puzzles matched to your level. Pick a theme or play a mix.</Label>
            {groups.map((g) => (
              <View key={g.title} style={{ gap: 6 }}>
                <Label muted size={13} bold>
                  {g.title.toUpperCase()}
                </Label>
                <View style={styles.chips}>
                  {g.themes.map(([key, label]) => {
                    const on = theme === key;
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => setTheme(on ? null : key)}
                        style={[styles.chip, { borderColor: on ? t.accent : t.glassBorder, backgroundColor: on ? t.accent : t.surface }]}>
                        <Text style={{ color: on ? t.onAccent : t.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            <Button title={theme ? 'Start themed training' : 'Start training'} onPress={() => router.push({ pathname: '/puzzles/train', params: theme ? { theme } : {} })} />
          </Card>

          <View style={styles.modes}>
            <Card style={styles.mode}>
              <Label size={18} bold>
                Streak
              </Label>
              <Label muted>Climbing difficulty. One mistake ends it.</Label>
              <Button variant="secondary" title="Play streak" onPress={() => router.push({ pathname: '/puzzles/run', params: { mode: 'streak' } })} />
            </Card>
            <Card style={styles.mode}>
              <Label size={18} bold>
                Rush
              </Label>
              <Label muted>Three minutes, three lives.</Label>
              <Button variant="secondary" title="Play rush" onPress={() => router.push({ pathname: '/puzzles/run', params: { mode: 'rush' } })} />
            </Card>
          </View>

          <Label muted size={12}>
            Puzzles from the Lichess open database (CC0).
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
