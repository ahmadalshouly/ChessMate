import type { FriendEntry } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, presenceLabel } from '@/components/social';
import { useI18n } from '@/i18n';
import { onPresence, onSocialEvent } from '@/lib/realtime';
import { socialApi } from '@/lib/social/api';
import { useSocialIdentity } from '@/lib/social/session';
import { Text, useAppTheme } from '@/ui';

/** A safety net only: presence and friend changes arrive live over the socket. */
const POLL_MS = 120_000;

/** Friends who are online or playing right now, playing first. Empty when signed out. */
export function useOnlineFriends(): { friends: FriendEntry[]; loaded: boolean } {
  const me = useSocialIdentity();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!me) {
      setFriends([]);
      setLoaded(false);
      return;
    }
    let alive = true;
    const load = () =>
      socialApi.friends().then(
        (list) => {
          if (!alive) return;
          const rank = (f: FriendEntry) => (f.presence.status === 'playing' ? 0 : 1);
          setFriends(list.filter((f) => f.presence.status !== 'offline').sort((a, b) => rank(a) - rank(b)));
          setLoaded(true);
        },
        () => alive && setLoaded(true),
      );
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    // Live: friends coming online or starting a game, and new friendships.
    const offPresence = onPresence(() => void load());
    const offSocial = onSocialEvent((e) => e.kind !== 'message' && void load());
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void load());
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
      offPresence();
      offSocial();
    };
  }, [me]);

  return { friends, loaded };
}

/**
 * Home, under Quick pair: up to four online friends as squares (three on small
 * phones), then a square that opens Friends. Tapping a friend opens their page
 * (watch, challenge, message).
 */
export function OnlineFriends({ width }: { width: number }) {
  const t = useAppTheme();
  const c = t.colors;
  const { tr, rtl } = useI18n();
  const me = useSocialIdentity();
  const { friends, loaded } = useOnlineFriends();
  if (!me) return null;

  const shown = friends.slice(0, width < 380 ? 3 : 4);
  const gap = 8;
  // Squares: same size whether 1 or 4 friends are online, never wider than 96.
  const size = Math.min(96, Math.floor((width - gap * 4) / 5));

  return (
    <View style={{ gap: t.space.sm }}>
      <View style={styles.head}>
        <Text variant="label" tone="muted">
          {tr('home.onlineFriends.title')}
        </Text>
        {loaded && friends.length > 0 && (
          <Text variant="caption" tone="tertiary">
            {tr('home.onlineFriends.count', { count: friends.length })}
          </Text>
        )}
      </View>
      <View style={[styles.row, { gap }]}>
        {shown.map((f) => (
          <Pressable
            key={f.user.id}
            accessibilityRole="button"
            accessibilityLabel={`${f.user.displayName}, ${presenceLabel(f.presence)}`}
            onPress={() => router.push(`/friends/user/${f.user.id}`)}
            style={({ pressed }) => [styles.cell, { width: size, height: size, borderColor: c.border, backgroundColor: pressed ? c.surfacePressed : c.surface }]}>
            <Avatar user={f.user} size={Math.round(size * 0.42)} presence={f.presence} />
            <Text variant="caption" numberOfLines={1} style={styles.name}>
              {f.user.displayName || f.user.username}
            </Text>
          </Pressable>
        ))}
        {loaded && shown.length === 0 && (
          <View style={[styles.empty, { height: size, borderColor: c.border }]}>
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {tr('home.onlineFriends.none')}
            </Text>
          </View>
        )}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={tr('home.onlineFriends.all')}
          onPress={() => router.push('/friends')}
          style={({ pressed }) => [styles.cell, { width: size, height: size, borderColor: c.borderStrong, backgroundColor: pressed ? c.surfacePressed : 'transparent' }]}>
          <Ionicons name={rtl ? 'arrow-back' : 'arrow-forward'} size={20} color={c.text} />
          <Text variant="caption" numberOfLines={1} style={styles.name}>
            {tr('home.onlineFriends.all')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  row: { flexDirection: 'row' },
  cell: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  name: { maxWidth: '100%', textAlign: 'center' },
  empty: { flex: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', justifyContent: 'center', paddingHorizontal: 12 },
});
