import Ionicons from '@expo/vector-icons/Ionicons';
import { PUZZLE_THEME_GROUPS, type PuzzleDto, type PuzzleProfileDto } from '@chessmate/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { Board } from '@/components/Board';
import { formatNumber, translate, useT } from '@/i18n';
import { puzzleGroupLabel, puzzleThemeLabel } from '@/i18n/chess';
import { puzzleApi } from '@/lib/puzzleApi';
import { Button, GlassView, Row, Screen, SectionHeader, Skeleton, Stack, Text, useAppTheme } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Puzzles home: your numbers, the ways to play (training, streak, rush), the daily puzzle and themes. */
export default function PuzzlesHome() {
  const t = useAppTheme();
  const tr = useT();
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<PuzzleProfileDto | null>(null);
  const [daily, setDaily] = useState<{ puzzle: PuzzleDto; attempted: boolean } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      Promise.all([puzzleApi.profile(), puzzleApi.daily().catch(() => null), puzzleApi.themes()])
        .then(([p, d, th]) => {
          if (!live) return;
          setProfile(p);
          setDaily(d);
          setCounts(th.counts);
          setTotal(th.total ?? null);
          setError(null);
        })
        .catch((e) => live && setError(e instanceof Error ? e.message : translate('puzzles.home.unreachable')))
        .finally(() => live && setLoaded(true));
      return () => {
        live = false;
      };
    }, []),
  );

  const groups = PUZZLE_THEME_GROUPS.map((g) => ({ ...g, themes: Object.entries(g.themes).filter(([k]) => (counts[k] ?? 0) > 0) })).filter((g) => g.themes.length > 0);
  const wide = width >= 900;
  const accuracy = profile && profile.attempts > 0 ? Math.round((profile.solved / profile.attempts) * 100) : null;
  const train = (theme?: string) => router.push({ pathname: '/puzzles/train', params: theme ? { theme } : {} });

  const modes = (
    <Stack gap="md" style={wide ? { flex: 1, minWidth: 0 } : undefined}>
      {/* The main way in: rated puzzles at your level */}
      <Pressable accessibilityRole="button" onPress={() => train()}>
        {({ pressed }) => (
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.md, opacity: pressed ? 0.9 : 1 }}>
            <Row gap="md">
              <ModeIcon name="locate" color={t.colors.accent} big />
              <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
                <Text variant="heading">{tr('puzzles.home.train')}</Text>
                <Text tone="muted">{tr('puzzles.home.trainBody')}</Text>
              </Stack>
            </Row>
            <Button title={tr('puzzles.home.start')} leftIcon={<Ionicons name="play" size={16} color={t.colors.textInverse} />} onPress={() => train()} />
          </GlassView>
        )}
      </Pressable>
      <Row gap="md" align="stretch" wrap>
        <ModeCard
          icon="flame"
          color="#E8743B"
          title={tr('puzzles.home.streak')}
          body={tr('puzzles.home.streakBody')}
          best={profile ? tr('puzzles.home.bestScore', { n: profile.bestStreak }) : null}
          onPress={() => router.push({ pathname: '/puzzles/run', params: { mode: 'streak' } })}
        />
        <ModeCard
          icon="flash"
          color="#7A5AF8"
          title={tr('puzzles.home.rush')}
          body={tr('puzzles.home.rushBody')}
          best={profile ? tr('puzzles.home.bestScore', { n: profile.bestRush }) : null}
          onPress={() => router.push({ pathname: '/puzzles/run', params: { mode: 'rush' } })}
        />
      </Row>
    </Stack>
  );

  const dailyCard = daily ? (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/puzzles/train', params: { daily: '1' } })} style={wide ? { width: 340 } : undefined}>
      {({ pressed }) => (
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.md, opacity: pressed ? 0.9 : 1, height: wide ? '100%' : undefined }}>
          <Row gap="xs">
            <Ionicons name="calendar-outline" size={16} color={t.colors.accent} />
            <Text variant="overline" tone="accent">
              {tr('puzzles.daily')}
            </Text>
            {daily.attempted ? (
              <View style={{ marginStart: 'auto' }}>
                <Ionicons name="checkmark-circle" size={18} color={t.colors.success} />
              </View>
            ) : null}
          </Row>
          <View style={{ alignItems: 'center' }}>
            <View style={{ borderRadius: t.radii.md, overflow: 'hidden' }}>
              <Board fen={daily.puzzle.fen} orientation={daily.puzzle.fen.split(' ')[1] === 'w' ? 'b' : 'w'} size={wide ? 296 : Math.min(260, width - 96)} hideCoordinates />
            </View>
          </View>
          <Text tone="muted">{daily.attempted ? tr('puzzles.home.dailyDone') : tr('puzzles.home.dailyNew')}</Text>
          <Button
            title={daily.attempted ? tr('puzzles.home.replay') : tr('puzzles.home.solve')}
            variant={daily.attempted ? 'secondary' : 'primary'}
            onPress={() => router.push({ pathname: '/puzzles/train', params: { daily: '1' } })}
          />
        </GlassView>
      )}
    </Pressable>
  ) : null;

  return (
    <Screen scroll width="wide">
      {/* The app header already says "Puzzles". */}
      <Text tone="muted">{total ? tr('puzzles.home.subtitle', { n: formatNumber(total) }) : tr('puzzles.home.credit')}</Text>

      {error ? (
        <GlassView padding="lg" radius="lg" style={{ gap: 4 }}>
          <Text variant="bodyStrong">{tr('play.offline')}</Text>
          <Text tone="muted">{error}</Text>
        </GlassView>
      ) : null}

      {/* Your numbers */}
      <Row gap="sm" wrap align="stretch">
        <StatTile icon="trending-up" label={tr('puzzles.home.rating')} value={profile ? `${profile.rating}${profile.provisional ? '?' : ''}` : null} loading={!loaded} />
        <StatTile icon="checkmark-done" label={tr('puzzles.home.solved')} value={profile ? formatNumber(profile.solved) : null} sub={accuracy !== null ? tr('puzzles.home.accuracy', { pct: accuracy }) : undefined} loading={!loaded} />
        <StatTile icon="flame-outline" label={tr('puzzles.home.bestStreak')} value={profile ? String(profile.bestStreak) : null} loading={!loaded} />
        <StatTile icon="flash-outline" label={tr('puzzles.home.bestRush')} value={profile ? String(profile.bestRush) : null} loading={!loaded} />
      </Row>

      {wide ? (
        <Row gap="lg" align="stretch">
          {modes}
          {dailyCard}
        </Row>
      ) : (
        <Stack gap="md">
          {modes}
          {dailyCard}
        </Stack>
      )}

      {/* Themes: one tap starts training on that theme */}
      {groups.length > 0 ? (
        <Stack gap="md">
          <SectionHeader title={tr('puzzles.home.themes')} />
          <Text tone="muted" style={{ marginTop: -t.space.sm }}>
            {tr('puzzles.home.themesBody')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md }}>
            {groups.map((g) => (
              <GlassView key={g.title} padding="md" radius="lg" style={{ gap: t.space.sm, flexGrow: 1, flexBasis: wide ? 300 : '100%' }}>
                <Text variant="overline" tone="muted">
                  {puzzleGroupLabel(g.title)}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {g.themes.map(([key]) => (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityLabel={`${puzzleThemeLabel(key)}, ${formatNumber(counts[key] ?? 0)}`}
                      onPress={() => train(key)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: t.colors.border,
                        backgroundColor: pressed ? t.colors.surfaceSunken : 'transparent',
                      })}>
                      <Text variant="label">{puzzleThemeLabel(key)}</Text>
                      <Text variant="caption" tone="muted">
                        {formatNumber(counts[key] ?? 0)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </GlassView>
            ))}
          </View>
        </Stack>
      ) : null}

      <Text variant="caption" tone="muted">
        {tr('puzzles.home.credit')}
      </Text>
    </Screen>
  );
}

function ModeIcon({ name, color, big }: { name: IconName; color: string; big?: boolean }) {
  const s = big ? 52 : 40;
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}22` }}>
      <Ionicons name={name} size={big ? 26 : 20} color={color} />
    </View>
  );
}

function ModeCard({ icon, color, title, body, best, onPress }: { icon: IconName; color: string; title: string; body: string; best: string | null; onPress: () => void }) {
  const t = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={{ flexGrow: 1, flexBasis: 220 }}>
      {({ pressed }) => (
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm, height: '100%', opacity: pressed ? 0.9 : 1 }}>
          <Row gap="sm">
            <ModeIcon name={icon} color={color} />
            <Text variant="heading" style={{ flex: 1 }}>
              {title}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={t.colors.muted} />
          </Row>
          <Text tone="muted">{body}</Text>
          {best ? (
            <Text variant="caption" style={{ color }}>
              {best}
            </Text>
          ) : null}
        </GlassView>
      )}
    </Pressable>
  );
}

function StatTile({ icon, label, value, sub, loading }: { icon: IconName; label: string; value: string | null; sub?: string; loading: boolean }) {
  const t = useAppTheme();
  return (
    <GlassView padding="md" radius="lg" style={{ flexGrow: 1, flexBasis: 150, gap: 4 }}>
      <Row gap="xs">
        <Ionicons name={icon} size={15} color={t.colors.muted} />
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {label}
        </Text>
      </Row>
      {loading ? <Skeleton width={56} height={26} /> : <Text variant="title">{value ?? '–'}</Text>}
      {sub ? (
        <Text variant="caption" tone="muted">
          {sub}
        </Text>
      ) : null}
    </GlassView>
  );
}
