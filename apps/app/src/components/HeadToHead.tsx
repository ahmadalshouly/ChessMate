import type { Color, Presence } from '@chessmate/core';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDate, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { apiRequest } from '@/lib/social/api';
import { Button, GlassView, Text, useAppTheme } from '@/ui';

interface HeadToHead {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  lastPlayedAt: number | null;
  recent: { id: string; color: Color; result: '1-0' | '0-1' | '1/2-1/2'; endedAt: number | null }[];
}

/**
 * Your record against another player (wins, draws, losses and the last few
 * games, each opening its replay) with a Challenge button. Shown on their
 * profile and their Social page; refreshed whenever the page comes back.
 */
/**
 * `presence` decides the action: Watch while they play a live game, Challenge
 * only while they are online, nothing when offline or hidden.
 */
export function HeadToHeadCard({ userId, name, presence }: { userId: string; name: string; presence: Presence | null }) {
  const c = useAppTheme().colors;
  const tr = useT();
  const [h2h, setH2h] = useState<HeadToHead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      apiRequest<{ h2h: HeadToHead }>('GET', `/api/games/h2h/${encodeURIComponent(userId)}`).then(
        (r) => {
          if (!live) return;
          setH2h(r.h2h);
          setError(null);
        },
        (e: Error) => live && setError(e.message),
      );
      return () => {
        live = false;
      };
    }, [userId]),
  );

  const challenge = () => router.push({ pathname: '/play/online', params: { mode: 'friend', to: userId } });
  const total = h2h?.games ?? 0;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : '0%');

  return (
    <GlassView radius="xl" padding="lg" style={{ gap: 14 }}>
      <View style={styles.head}>
        <Text variant="heading" style={styles.title} numberOfLines={2}>
          {tr('h2h.title', { name })}
        </Text>
        {presence?.status === 'playing' && presence.gameId ? (
          <Button
            size="sm"
            variant="secondary"
            title={tr('friends.watch')}
            onPress={() => router.push(`/watch/${presence.gameId}`)}
            leftIcon={<MaterialCommunityIcons name="eye-outline" size={15} color={c.text} />}
          />
        ) : presence?.status === 'online' ? (
          <Button
            size="sm"
            title={tr('h2h.challenge')}
            onPress={challenge}
            leftIcon={<MaterialCommunityIcons name="sword-cross" size={15} color={c.onAccent} />}
          />
        ) : null}
      </View>

      {error ? (
        <Text tone="muted">{serverText(error)}</Text>
      ) : !h2h ? (
        <Text tone="muted">{tr('common.loading')}</Text>
      ) : total === 0 ? (
        <Text tone="muted">{tr('h2h.none', { name })}</Text>
      ) : (
        <>
          <View style={styles.stats}>
            <Stat value={h2h.wins} label={tr('h2h.wins')} />
            <Stat value={h2h.draws} label={tr('h2h.draws')} />
            <Stat value={h2h.losses} label={tr('h2h.losses')} />
            <Stat value={total} label={tr('h2h.games')} />
          </View>
          <View style={[styles.bar, { backgroundColor: c.border }]} accessibilityLabel={tr('h2h.summary', { wins: h2h.wins, draws: h2h.draws, losses: h2h.losses })}>
            <View style={{ width: pct(h2h.wins), backgroundColor: c.text }} />
            <View style={{ width: pct(h2h.draws), backgroundColor: c.textTertiary }} />
          </View>
          <View style={styles.recent}>
            {h2h.recent.map((g) => {
              const won = g.result !== '1/2-1/2' && (g.result === '1-0') === (g.color === 'w');
              const mark = g.result === '1/2-1/2' ? tr('profile.d') : won ? tr('profile.w') : tr('profile.l');
              return (
                <Pressable
                  key={g.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${mark} ${g.endedAt ? formatDate(g.endedAt, { day: 'numeric', month: 'short' }) : ''}`}
                  onPress={() => router.push({ pathname: '/game/[id]', params: { id: g.id, side: g.color } })}
                  style={({ pressed }) => [
                    styles.chip,
                    won ? { backgroundColor: c.accent, borderColor: c.accent } : { borderColor: c.borderStrong },
                    { opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <Text variant="label" color={won ? c.onAccent : c.text}>
                    {mark}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {h2h.lastPlayedAt && (
            <Text variant="caption" tone="muted">
              {tr('h2h.last', { date: formatDate(h2h.lastPlayedAt, { day: 'numeric', month: 'short', year: 'numeric' }) })}
            </Text>
          )}
        </>
      )}
    </GlassView>
  );
}

/** One number in an equal-width tile; the line height fits the figure so it is never clipped. */
function Stat({ value, label }: { value: number; label: string }) {
  const c = useAppTheme().colors;
  return (
    <View style={[styles.stat, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
      <Text variant="numeric" style={styles.statValue}>
        {value}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  title: { flexGrow: 1, flexShrink: 1, flexBasis: 160 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  statValue: { fontSize: 22, lineHeight: 28 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  chip: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
