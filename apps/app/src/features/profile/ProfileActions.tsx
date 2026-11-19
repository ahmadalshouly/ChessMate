import type { PublicProfile, Relationship } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { socialApi } from '@/lib/social/api';
import { useSocialIdentity } from '@/lib/social/session';
import { Button, Text, useAppTheme } from '@/ui';

import { ProfileQrSheet } from './ProfileQrSheet';

/**
 * Buttons under a profile header. Someone else's: Add friend (or the request
 * state), Message and Share. Your own: Edit, Share (QR code) and Settings.
 */
export function ProfileActions({ profile }: { profile: PublicProfile }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const me = useSocialIdentity();
  const [rel, setRel] = useState<Relationship | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState(false);
  const other = !profile.isMe && !!me && me.userId !== profile.id;

  const load = useCallback(() => {
    if (!other) return;
    socialApi.user(profile.id).then(
      (p) => setRel(p.relationship),
      () => setRel(null),
    );
  }, [other, profile.id]);
  useEffect(load, [load]);

  const act = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    try {
      await fn();
      setError(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const share = (
    <Button
      variant="secondary"
      size="sm"
      title={tr('qr.shareProfile')}
      leftIcon={<Ionicons name="qr-code-outline" size={15} color={c.text} />}
      onPress={() => setQr(true)}
    />
  );

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        {profile.isMe ? (
          <>
            <Button variant="secondary" size="sm" title={tr('profile.edit')} onPress={() => router.push('/profile/edit')} />
            {share}
            <Button variant="secondary" size="sm" title={tr('settings.title')} onPress={() => router.push('/settings')} />
          </>
        ) : (
          <>
            {other && rel && !rel.blocked && (
              rel.friend ? (
                <Button variant="secondary" size="sm" title={tr('friends.friend')} leftIcon={<Ionicons name="checkmark" size={15} color={c.text} />} onPress={() => router.push(`/friends/user/${profile.id}`)} />
              ) : rel.request === 'incoming' ? (
                <Button size="sm" title={tr('profile.actions.accept')} disabled={busy} onPress={act(() => socialApi.accept(profile.id))} />
              ) : rel.request === 'outgoing' ? (
                <Button variant="secondary" size="sm" title={tr('friends.requested')} disabled={busy} onPress={act(() => socialApi.cancel(profile.id))} />
              ) : (
                <Button
                  size="sm"
                  title={tr('friends.addFriend')}
                  disabled={busy}
                  leftIcon={<Ionicons name="person-add-outline" size={15} color={c.onAccent} />}
                  onPress={act(() => socialApi.sendRequest(profile.id))}
                />
              )
            )}
            {other && rel && !rel.blocked && (
              <Button
                variant="secondary"
                size="sm"
                title={tr('profile.actions.message')}
                leftIcon={<Ionicons name="chatbubble-outline" size={15} color={c.text} />}
                onPress={() => router.push({ pathname: '/messages/[key]', params: { key: profile.id } })}
              />
            )}
            {share}
          </>
        )}
      </View>
      {!profile.isMe && !me && <Text variant="caption" tone="muted">{tr('profile.actions.signInToAdd')}</Text>}
      {error && (
        <Text variant="caption" tone="danger">
          {serverText(error)}
        </Text>
      )}
      <ProfileQrSheet visible={qr} onClose={() => setQr(false)} username={profile.username} displayName={profile.displayName} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
