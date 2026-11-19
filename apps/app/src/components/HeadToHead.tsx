import type { Color } from '@chessmate/core';
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
export function HeadToHeadCard({ userId, name }: { userId: string; name: string }) {
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
        <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
          {tr('h2h.title', { name })}
        </Text>
        <Button
          size="sm"
          title={tr('h2h.challenge')}
          onPress={challenge}
          leftIcon={<MaterialCommunityIcons name="sword-cross" size={15} color={c.onAccent} />}
        />
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
            {h2h.lastPlayedAt && (
              <Text variant="caption" tone="muted" style={{ marginStart: 4 }}>
                {tr('h2h.last', { date: formatDate(h2h.lastPlayedAt, { day: 'numeric', month: 'short', year: 'numeric' }) })}
              </Text>
            )}
          </View>
        </>
      )}
    </GlassView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="numeric" style={{ fontSize: 22 }}>
        {value}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stats: { flexDirection: 'row', gap: 12 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  chip: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
