import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { useT } from '@/i18n';
import { useAwards } from '@/lib/awards';
import { Button, GlassView, SectionHeader, Stack, Text, useAppTheme } from '@/ui';

import { AwardBadge } from './AwardBadge';
import { awardName, tierName } from './catalog';

/** Profile card: the latest awards and a way to see them all. */
export function AwardsSummary({ username, isMe }: { username: string; isMe: boolean }) {
  const tr = useT();
  const t = useAppTheme();
  const { data } = useAwards(isMe ? null : username, isMe);
  const open = () => router.push({ pathname: '/awards', params: isMe ? {} : { user: username } });
  if (!data) return null;
  const earned = data.earned.length;
  const levelsTotal = data.progress.reduce((n, a) => n + a.maxLevel, 0);
  return (
    <Stack gap="sm">
      <SectionHeader title={tr('awards.title')} action={<Button title={tr('awards.seeAll')} variant="ghost" size="sm" onPress={open} />} />
      <GlassView radius="lg" padding="lg" style={{ gap: t.space.md }}>
        <Text variant="caption" tone="muted">
          {tr('awards.levelsCount', { earned, total: levelsTotal })}
        </Text>
        {earned === 0 ? (
          <Text tone="muted">{isMe ? tr('awards.none') : tr('awards.noneOf', { name: username })}</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space.md }}>
            {data.earned.slice(0, 10).map((e) => (
              <Pressable key={`${e.id}:${e.level}`} accessibilityRole="button" accessibilityLabel={`${awardName(e.id)}, ${tierName(e.level)}`} onPress={open}>
                <View style={{ width: 76, alignItems: 'center', gap: 4 }}>
                  <AwardBadge id={e.id} level={e.level} size="sm" />
                  <Text variant="caption" align="center" numberOfLines={2}>
                    {awardName(e.id)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </GlassView>
    </Stack>
  );
}
