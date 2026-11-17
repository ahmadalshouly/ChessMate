import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/shell/Logo';
import { useAuth } from '@/lib/auth';
import { Backdrop, Button, GlassView, Text, useAppTheme } from '@/ui';
import { LanguageChips } from '@/components/i18n/LanguageChips';
import { useI18n, type TKey } from '@/i18n';

const FEATURES: { icon: ComponentProps<typeof Ionicons>['name']; title: TKey; body: TKey }[] = [
  { icon: 'flash-outline', title: 'auth.welcome.rated', body: 'auth.welcome.ratedBody' },
  { icon: 'analytics-outline', title: 'auth.welcome.engine', body: 'auth.welcome.engineBody' },
  { icon: 'chatbubble-ellipses-outline', title: 'auth.welcome.coach', body: 'auth.welcome.coachBody' },
];

export default function Welcome() {
  const t = useAppTheme();
  const c = t.colors;
  const { continueAsGuest } = useAuth();
  const { tr, rtl } = useI18n();

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
                {tr('auth.welcome.tagline')}
              </Text>
            </View>

            <GlassView radius="xl" style={{ paddingVertical: 6 }}>
              {FEATURES.map((f, i) => (
                <View key={f.title} style={[styles.feature, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}>
                  <View style={[styles.icon, { borderColor: c.borderStrong }]}>
                    <Ionicons name={f.icon} size={17} color={c.text} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="subheading">{tr(f.title)}</Text>
                    <Text variant="caption" tone="muted">
                      {tr(f.body)}
                    </Text>
                  </View>
                </View>
              ))}
            </GlassView>

            <View style={styles.actions}>
              <Button title={tr('auth.welcome.createAccount')} size="lg" fullWidth onPress={() => router.push('/sign-up')} />
              <Button title={tr('auth.signIn')} size="lg" variant="secondary" fullWidth onPress={() => router.push('/sign-in')} />
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  await continueAsGuest();
                  router.replace('/');
                }}
                style={({ pressed }) => [styles.guest, { opacity: pressed ? 0.6 : 1 }]}>
                <Text variant="label">{tr('auth.continueAsGuest')}</Text>
                <Ionicons name={rtl ? 'arrow-back' : 'arrow-forward'} size={14} color={c.text} />
              </Pressable>
              <Text variant="caption" tone="tertiary" align="center">
                {tr('auth.welcome.guestNote')}
              </Text>
            </View>
            <LanguageChips />
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
