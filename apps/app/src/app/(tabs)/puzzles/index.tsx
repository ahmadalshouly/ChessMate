import Ionicons from '@expo/vector-icons/Ionicons';
import { PUZZLE_THEME_GROUPS, type PuzzleDto, type PuzzleProfileDto } from '@chessmate/core';
import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

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

  const groups = useMemo(
    () => PUZZLE_THEME_GROUPS.map((g) => ({ ...g, themes: Object.entries(g.themes).filter(([k]) => (counts[k] ?? 0) > 0) })).filter((g) => g.themes.length > 0),
    [counts],
  );
  const wide = width >= 900;
  const accuracy = profile && profile.attempts > 0 ? Math.round((profile.solved / profile.attempts) * 100) : null;
  const train = useCallback((theme?: string) => router.push({ pathname: '/puzzles/train', params: theme ? { theme } : {} }), []);
  const openDaily = () => router.push({ pathname: '/puzzles/train', params: { daily: '1' } });
  const c = t.colors;

  const modes = (
    <Stack gap="md" style={wide ? { flex: 1, minWidth: 0 } : undefined}>
      {/* The main way in: rated puzzles at your level. One button, so no button inside a button. */}
      <GlassView strength="strong" padding="xl" radius="xl" style={{ gap: t.space.lg }}>
        <Row gap="md">
          <ModeIcon name="locate" big />
          <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title">{tr('puzzles.home.train')}</Text>
            <Text tone="muted">{tr('puzzles.home.trainBody')}</Text>
          </Stack>
        </Row>
        <Button title={tr('puzzles.home.start')} size="lg" fullWidth leftIcon={<Ionicons name="play" size={16} color={c.onAccent} />} onPress={() => train()} />
      </GlassView>
      <Row gap="md" align="stretch" wrap style={wide ? { flex: 1 } : undefined}>
        <ModeCard
          icon="flame-outline"
          title={tr('puzzles.home.streak')}
          body={tr('puzzles.home.streakBody')}
          best={profile ? tr('puzzles.home.bestScore', { n: profile.bestStreak }) : null}
          onPress={() => router.push({ pathname: '/puzzles/run', params: { mode: 'streak' } })}
        />
        <ModeCard
          icon="flash-outline"
          title={tr('puzzles.home.rush')}
          body={tr('puzzles.home.rushBody')}
          best={profile ? tr('puzzles.home.bestScore', { n: profile.bestRush }) : null}
          onPress={() => router.push({ pathname: '/puzzles/run', params: { mode: 'rush' } })}
        />
      </Row>
    </Stack>
  );

  const boardSize = wide ? 292 : Math.min(280, width - 96);
  const dailyCard = daily ? (
    <GlassView padding="lg" radius="xl" style={[{ gap: t.space.md }, wide && { width: 340 }]}>
      <Row gap="xs">
        <Ionicons name="calendar-outline" size={15} color={c.text} />
        <Text variant="overline">{tr('puzzles.daily')}</Text>
        {daily.attempted ? (
          <View style={{ marginStart: 'auto' }}>
            <Ionicons name="checkmark-circle" size={18} color={c.success} />
          </View>
        ) : null}
      </Row>
      <Pressable accessibilityRole="button" accessibilityLabel={tr('puzzles.daily')} onPress={openDaily} style={{ alignItems: 'center' }}>
        {({ pressed }) => (
          <View style={{ borderRadius: t.radii.md, overflow: 'hidden', opacity: pressed ? 0.85 : 1 }}>
            <Board fen={daily.puzzle.fen} orientation={daily.puzzle.fen.split(' ')[1] === 'w' ? 'b' : 'w'} size={boardSize} hideCoordinates />
          </View>
        )}
      </Pressable>
      <Text tone="muted">{daily.attempted ? tr('puzzles.home.dailyDone') : tr('puzzles.home.dailyNew')}</Text>
      <Button title={daily.attempted ? tr('puzzles.home.replay') : tr('puzzles.home.solve')} variant={daily.attempted ? 'secondary' : 'primary'} fullWidth onPress={openDaily} />
    </GlassView>
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

      {/* Your numbers: one glass panel (one blur) instead of four. */}
      <GlassView radius="xl" style={styles.stats}>
        <StatCell icon="trending-up" label={tr('puzzles.home.rating')} value={profile ? `${profile.rating}${profile.provisional ? '?' : ''}` : null} loading={!loaded} wide={wide} />
        <StatCell icon="checkmark-done" label={tr('puzzles.home.solved')} value={profile ? formatNumber(profile.solved) : null} sub={accuracy !== null ? tr('puzzles.home.accuracy', { pct: accuracy }) : undefined} loading={!loaded} wide={wide} edge />
        <StatCell icon="flame-outline" label={tr('puzzles.home.bestStreak')} value={profile ? String(profile.bestStreak) : null} loading={!loaded} wide={wide} edge={wide} top={!wide} />
        <StatCell icon="flash-outline" label={tr('puzzles.home.bestRush')} value={profile ? String(profile.bestRush) : null} loading={!loaded} wide={wide} edge top={!wide} />
      </GlassView>

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
              <ThemeGroup key={g.title} title={g.title} themes={g.themes} counts={counts} wide={wide} onPick={train} />
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

/** Monochrome icon in a glass circle: colour is kept for game signals. */
function ModeIcon({ name, big }: { name: IconName; big?: boolean }) {
  const t = useAppTheme();
  const s = big ? 52 : 40;
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceSunken, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.glassBorder }}>
      <Ionicons name={name} size={big ? 24 : 19} color={t.colors.text} />
    </View>
  );
}

function ModeCard({ icon, title, body, best, onPress }: { icon: IconName; title: string; body: string; best: string | null; onPress: () => void }) {
  const t = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={{ flexGrow: 1, flexBasis: 220 }}>
      {({ pressed }) => (
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm, height: '100%', transform: [{ scale: pressed ? 0.985 : 1 }] }}>
          {pressed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.surfacePressed }]} />}
          <Row gap="sm">
            <ModeIcon name={icon} />
            <Text variant="heading" style={{ flex: 1 }}>
              {title}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={t.colors.muted} />
          </Row>
          <Text tone="muted">{body}</Text>
          {best ? (
            <Text variant="numeric" tone="muted">
              {best}
            </Text>
          ) : null}
        </GlassView>
      )}
    </Pressable>
  );
}

function StatCell({ icon, label, value, sub, loading, wide, edge, top }: { icon: IconName; label: string; value: string | null; sub?: string; loading: boolean; wide: boolean; edge?: boolean; top?: boolean }) {
  const t = useAppTheme();
  return (
    <View
      style={[
        styles.stat,
        { flexBasis: wide ? '25%' : '50%', padding: t.space.lg, borderColor: t.colors.border },
        edge && { borderStartWidth: StyleSheet.hairlineWidth },
        top && { borderTopWidth: StyleSheet.hairlineWidth },
      ]}>
      <Row gap="xs">
        <Ionicons name={icon} size={14} color={t.colors.muted} />
        <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </Row>
      {loading ? <Skeleton width={56} height={28} /> : <Text variant="figure">{value ?? '–'}</Text>}
      {sub ? (
        <Text variant="caption" tone="muted">
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One group of theme chips. Flat glass (no backdrop blur): eight blurred panels in a
 * scroll view were the most expensive part of this screen to draw and scroll.
 */
const ThemeGroup = memo(function ThemeGroup({
  title,
  themes,
  counts,
  wide,
  onPick,
}: {
  title: string;
  themes: [string, unknown][];
  counts: Record<string, number>;
  wide: boolean;
  onPick: (theme: string) => void;
}) {
  const t = useAppTheme();
  return (
    <GlassView flat padding="md" radius="lg" elevation="none" style={{ gap: t.space.sm, flexGrow: 1, flexBasis: wide ? 300 : '100%' }}>
      <Text variant="overline" tone="muted">
        {puzzleGroupLabel(title)}
      </Text>
      <View style={styles.chips}>
        {themes.map(([key]) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={`${puzzleThemeLabel(key)}, ${formatNumber(counts[key] ?? 0)}`}
            onPress={() => onPick(key)}
            style={({ pressed }) => [styles.chip, { borderColor: t.colors.border, backgroundColor: pressed ? t.colors.surfacePressed : t.colors.surfaceSubtle }]}>
            <Text variant="label">{puzzleThemeLabel(key)}</Text>
            <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
              {formatNumber(counts[key] ?? 0)}
            </Text>
          </Pressable>
        ))}
      </View>
    </GlassView>
  );
});

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap' },
  stat: { gap: 6, flexGrow: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
});
