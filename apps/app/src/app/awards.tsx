import { AWARD_CATEGORIES, AWARD_TIERS, tierOf, type AwardCategory, type AwardProgress } from '@chessmate/core';
import { Stack as RouterStack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AwardBadge } from '@/features/awards/AwardBadge';
import { AwardDetail, ProgressBar } from '@/features/awards/AwardDetail';
import { awardName, tierColor, tierName } from '@/features/awards/catalog';
import { useT } from '@/i18n';
import { useAwards } from '@/lib/awards';
import { useSocialIdentity } from '@/lib/social/session';
import { Button, Chip, GlassView, Row, Screen, SectionHeader, Skeleton, Stack, Text, useAppTheme } from '@/ui';

type Filter = AwardCategory | 'all' | 'earned';

/** Every award with its progress, for you or another player (?user=<username>). */
export default function AwardsScreen() {
  const tr = useT();
  const t = useAppTheme();
  const params = useLocalSearchParams<{ user?: string }>();
  const user = params.user ? String(params.user) : null;
  const me = useSocialIdentity();
  const own = user === null || user === me?.userId || user === me?.name;
  const { data, error, loading, reload } = useAwards(own ? null : user, own);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<AwardProgress | null>(null);

  const list = useMemo(() => {
    const all = data?.progress ?? [];
    const shown = filter === 'all' ? all : filter === 'earned' ? all.filter((a) => a.level > 0) : all.filter((a) => a.category === filter);
    // Earned first (highest level), then closest to the next level.
    return [...shown].sort((a, b) => b.level - a.level || (b.next ? b.value / b.next : 1) - (a.next ? a.value / a.next : 1));
  }, [data, filter]);

  const levelsEarned = data?.progress.reduce((n, a) => n + a.level, 0) ?? 0;
  const levelsTotal = data?.progress.reduce((n, a) => n + a.maxLevel, 0) ?? 0;
  const perTier = AWARD_TIERS.map((tier) => ({ tier, count: data?.earned.filter((e) => tierOf(e.level) === tier).length ?? 0 }));
  const recent = data?.earned.slice(0, 8) ?? [];

  return (
    <Screen scroll width="wide">
      <RouterStack.Screen options={{ title: own ? tr('awards.title') : tr('awards.titleOf', { name: user ?? '' }) }} />
      {!own || me ? null : (
        <GlassView padding="lg" radius="xl">
          <Text tone="muted">{tr('awards.signIn')}</Text>
        </GlassView>
      )}
      {error && !data ? (
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
          <Text tone="muted">{tr('awards.loadFailed', { reason: error })}</Text>
          <Button title={tr('common.tryAgain')} variant="secondary" onPress={() => void reload()} />
        </GlassView>
      ) : !data ? (
        loading && <Skeleton height={140} radius={24} />
      ) : (
        <>
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
            <Row justify="space-between" gap="md">
              <Stack gap="xs" style={{ flex: 1 }}>
                <Text variant="overline" tone="muted">
                  {tr('awards.collection')}
                </Text>
                <Text variant="figure">{tr('awards.levelsCount', { earned: levelsEarned, total: levelsTotal })}</Text>
              </Stack>
              <Row gap="sm">
                {perTier.map(({ tier, count }, i) => (
                  <View key={tier} accessible accessibilityLabel={`${tierName(i + 1)}: ${count}`} style={styles.tierStat}>
                    <View style={[styles.dot, { backgroundColor: tierColor(i + 1) }]} />
                    <Text variant="numeric">{count}</Text>
                  </View>
                ))}
              </Row>
            </Row>
            <ProgressBar value={levelsEarned} from={0} to={Math.max(1, levelsTotal)} />
          </GlassView>

          {recent.length > 0 && (
            <Stack gap="sm">
              <SectionHeader title={tr('awards.recent')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space.md, paddingVertical: 4 }}>
                {recent.map((e) => {
                  const p = data.progress.find((a) => a.id === e.id);
                  return (
                    <Pressable key={`${e.id}:${e.level}`} accessibilityRole="button" onPress={() => p && setOpen(p)} style={styles.recent}>
                      <AwardBadge id={e.id} level={e.level} size="md" />
                      <Text variant="caption" align="center" numberOfLines={2}>
                        {awardName(e.id)}
                      </Text>
                      <Text variant="caption" tone="muted" align="center">
                        {tierName(e.level)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Stack>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space.sm }}>
            {(['all', 'earned', ...AWARD_CATEGORIES] as Filter[]).map((f) => (
              <Chip key={f} label={tr(`awards.filters.${f}`)} selected={filter === f} onPress={() => setFilter(f)} />
            ))}
          </ScrollView>

          {list.length === 0 ? (
            <GlassView padding="lg" radius="xl">
              <Text tone="muted">{own ? tr('awards.none') : tr('awards.noneOf', { name: user ?? '' })}</Text>
            </GlassView>
          ) : (
            <View style={styles.grid}>
              {list.map((a) => (
                <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`${awardName(a.id)}, ${a.level ? tierName(a.level) : tr('awards.locked')}`} onPress={() => setOpen(a)} style={styles.cell}>
                  {({ pressed }) => (
                    <GlassView padding="md" radius="lg" style={{ gap: t.space.sm, alignItems: 'center', opacity: pressed ? 0.85 : 1, minHeight: 168 }}>
                      <AwardBadge id={a.id} level={a.level} maxLevel={a.maxLevel} />
                      <Text variant="label" align="center" numberOfLines={2}>
                        {awardName(a.id)}
                      </Text>
                      <Text variant="caption" tone="muted" align="center">
                        {a.level ? tierName(a.level) : tr('awards.locked')}
                      </Text>
                      <View style={{ alignSelf: 'stretch', gap: 4 }}>
                        {a.next !== null ? (
                          <>
                            <ProgressBar value={a.value} from={a.current} to={a.next} />
                            <Text variant="caption" tone="muted" align="center">
                              {tr('awards.progress', { value: a.value, next: a.next })}
                            </Text>
                          </>
                        ) : (
                          <Text variant="caption" tone="muted" align="center">
                            {tr('awards.maxed')}
                          </Text>
                        )}
                      </View>
                    </GlassView>
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
      <AwardDetail award={open} view={data} onClose={() => setOpen(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { flexGrow: 1, flexBasis: 150, maxWidth: 220 },
  recent: { width: 92, alignItems: 'center', gap: 4 },
  tierStat: { alignItems: 'center', gap: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
