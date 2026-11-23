import { router, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { Button, GlassView, Text, useAppTheme } from '@/ui';

/**
 * Shown on friends, messages and tournament screens to players who are not
 * signed in. Signed-in players never see it: those screens use their account.
 * The username is the one chosen at sign-up.
 */
export function SignInPrompt() {
  const t = useAppTheme();
  const tr = useT();
  const { status } = useAuth();
  const here = usePathname();
  if (status === 'loading') return null;
  return (
    <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
      <Text variant="heading">{tr('social.devSignIn.title')}</Text>
      <Text tone="muted">{tr('social.devSignIn.prod')}</Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button title={tr('auth.signIn')} fullWidth onPress={() => router.push({ pathname: '/sign-in', params: { next: here } })} />
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" title={tr('auth.signUp.submit')} fullWidth onPress={() => router.push({ pathname: '/sign-up', params: { next: here } })} />
        </View>
      </View>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
});
