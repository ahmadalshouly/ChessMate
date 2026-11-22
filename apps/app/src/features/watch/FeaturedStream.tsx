import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { StreamerView } from '@chessmate/core';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { TitleBadge } from '@/features/titles/TitleBadge';
import { formatAgo, formatNumber, useT } from '@/i18n';
import { CountryFlag } from '@/components/CountryFlag';
import { Avatar, Button, GlassView, Row, Stack, Text, useAppTheme } from '@/ui';

import { LiveDot, PLATFORM_ICON, openLink } from './components';
import { StreamPlayer } from './StreamPlayer';

/** The most watched live streamer: the stream itself (web) or its preview, and buttons to the platform. */
export function FeaturedStream({ s, width }: { s: StreamerView; width: number }) {
  const tr = useT();
  const t = useAppTheme();
  const live = s.live!;
  const playerWidth = Math.min(width, 960);
  return (
    <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
      <View style={{ alignItems: 'center' }}>
        <StreamPlayer live={live} width={playerWidth} title={live.title || s.displayName} />
      </View>
      <Row gap="md" justify="space-between" wrap>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/profile/${encodeURIComponent(s.username)}`)} style={{ flexShrink: 1, minWidth: 0 }}>
          <Row gap="md">
            <Avatar name={s.displayName} size={44} />
            <Stack gap="xxs" style={{ flexShrink: 1, minWidth: 0 }}>
              <Row gap="xs">
                <TitleBadge title={s.title} size="sm" />
                <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {s.displayName}
                </Text>
                <CountryFlag code={s.country} />
              </Row>
              {live.title ? (
                <Text variant="caption" tone="muted" numberOfLines={2}>
                  {live.title}
                </Text>
              ) : null}
              <Row gap="xs">
                <LiveDot />
                <Text variant="caption" tone="muted">
                  {[live.viewers !== null ? tr('watch.viewers', { count: formatNumber(live.viewers) }) : null, tr('watch.streamer.liveSince', { when: formatAgo(live.since) })].filter(Boolean).join(' · ')}
                </Text>
              </Row>
            </Stack>
          </Row>
        </Pressable>
        <Row gap="sm" wrap>
          <Button
            title={tr('watch.openOn', { platform: tr(`watch.platforms.${live.platform}`) })}
            size="sm"
            leftIcon={<MaterialCommunityIcons name={PLATFORM_ICON[live.platform]} size={16} color={t.colors.textInverse} />}
            onPress={() => openLink(live.url)}
          />
          {s.channels
            .filter((c) => c.url !== live.url && c.platform !== live.platform)
            .slice(0, 3)
            .map((c) => (
              <Button
                key={c.url}
                title={tr(`watch.platforms.${c.platform}`)}
                variant="secondary"
                size="sm"
                leftIcon={<MaterialCommunityIcons name={PLATFORM_ICON[c.platform]} size={16} color={t.colors.text} />}
                onPress={() => openLink(c.url)}
              />
            ))}
        </Row>
      </Row>
    </GlassView>
  );
}
