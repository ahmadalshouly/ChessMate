import { usernameFromLink } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { QrCode } from '@/components/QrCode';
import { Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { profileLink } from '@/lib/links';
import { Button, GlassView, Text, TextField, useAppTheme } from '@/ui';

/**
 * Add a friend with a QR code: show your own code for them to scan with their
 * phone camera (it opens your profile, with Add friend), or open theirs from a
 * scanned or pasted link.
 */
export default function AddByQr() {
  const t = useAppTheme();
  const tr = useT();
  const { status, user } = useAuth();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const username = status === 'signedIn' && user ? user.username : null;

  const open = () => {
    const name = usernameFromLink(text);
    if (!name) return setError(tr('qr.invalidLink'));
    setError(null);
    router.push({ pathname: '/profile/[username]', params: { username: name } });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('qr.addTitle') }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={[styles.inner, { gap: t.space.lg }]}>
          <GlassView padding="lg" radius="xl" style={{ alignItems: 'center', gap: t.space.md }}>
            <Text variant="heading">{tr('qr.yourCode')}</Text>
            {username ? (
              <>
                <View style={styles.frame}>
                  <QrCode value={profileLink(username)} size={220} />
                </View>
                <Text tone="muted" align="center">
                  {tr('qr.scanHint')}
                </Text>
              </>
            ) : (
              <>
                <Text tone="muted" align="center">
                  {tr('qr.signInForCode')}
                </Text>
                <Button title={tr('auth.signIn')} onPress={() => router.push({ pathname: '/sign-in', params: { next: '/friends/add' } })} />
              </>
            )}
          </GlassView>

          <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
            <View style={styles.row}>
              <Ionicons name="scan-outline" size={20} color={t.colors.text} />
              <Text variant="heading">{tr('qr.theirCode')}</Text>
            </View>
            <Text tone="muted">{tr('qr.theirCodeBody')}</Text>
            <TextField
              label={tr('qr.linkLabel')}
              value={text}
              onChangeText={setText}
              placeholder="https://…/u/username"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={open}
              error={error ?? undefined}
            />
            <Button title={tr('qr.open')} disabled={!text.trim()} onPress={open} />
          </GlassView>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH },
  frame: { padding: 12, borderRadius: 24, backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
