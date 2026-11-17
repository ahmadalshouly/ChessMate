import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SocialSignIn } from '@/components/auth/SocialSignIn';
import { Logo } from '@/components/shell/Logo';
import { useAuth } from '@/lib/auth';
import { Backdrop, Button, GlassView, Text, useAppTheme } from '@/ui';

const FEATURES: { icon: ComponentProps<typeof Ionicons>['name']; title: string; body: string }[] = [
  { icon: 'flash-outline', title: 'Rated games, any time', body: 'Bullet to classical against players at your level.' },
  { icon: 'analytics-outline', title: 'Engine insight', body: 'Evaluation, accuracy and the best line after every game.' },
  { icon: 'chatbubble-ellipses-outline', title: 'A coach that explains', body: 'Threats and move feedback in plain language, as you play.' },
];

export default function Welcome() {
  const t = useAppTheme();
  const c = t.colors;
  const { continueAsGuest } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Backdrop />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.column}>
            <View style={styles.hero}>
              <Logo size={88} wordmark={false} />
              <Text style={[styles.word, { color: c.text, fontFamily: t.fonts.displayMedium }]}>CHESSMATE</Text>
              <Text variant="overline" tone="muted" style={{ letterSpacing: 3 }}>
                Play · Learn · Improve
              </Text>
            </View>

            <GlassView radius="xl" style={{ paddingVertical: 6 }}>
              {FEATURES.map((f, i) => (
                <View key={f.title} style={[styles.feature, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}>
                  <View style={[styles.icon, { borderColor: c.borderStrong }]}>
                    <Ionicons name={f.icon} size={17} color={c.text} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="subheading">{f.title}</Text>
                    <Text variant="caption" tone="muted">
                      {f.body}
                    </Text>
                  </View>
                </View>
              ))}
            </GlassView>

            <View style={styles.actions}>
              <Button title="Create free account" size="lg" fullWidth onPress={() => router.push('/sign-up')} />
              <Button title="Sign in" size="lg" variant="secondary" fullWidth onPress={() => router.push('/sign-in')} />
              <SocialSignIn onSignedIn={() => router.replace('/')} />
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  await continueAsGuest();
                  router.replace('/');
                }}
                style={({ pressed }) => [styles.guest, { opacity: pressed ? 0.6 : 1 }]}>
                <Text variant="label">Continue as guest</Text>
                <Ionicons name="arrow-forward" size={14} color={c.text} />
              </Pressable>
              <Text variant="caption" tone="tertiary" align="center">
                Guests can play casual games and use the practice board. Ratings and history need an account.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16, paddingVertical: 40 },
  column: { width: '100%', maxWidth: 420, gap: 28 },
  hero: { alignItems: 'center', gap: 10 },
  word: { fontSize: 30, lineHeight: 36, letterSpacing: 5, marginTop: 8 },
  feature: { flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18 },
  icon: { width: 38, height: 38, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: 10, alignItems: 'stretch' },
  guest: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
});
