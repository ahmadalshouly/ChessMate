import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SocialSignIn } from '@/components/auth/SocialSignIn';
import { BrandLine } from '@/components/shell/BrandLine';
import { Logo } from '@/components/shell/Logo';
import { useAuth } from '@/lib/auth';
import { Backdrop, Button, GlassView, Text, useAppTheme } from '@/ui';
import { LanguagePicker } from '@/components/i18n/LanguagePicker';
import { useI18n, type TKey } from '@/i18n';

const FEATURES: { icon: ComponentProps<typeof Ionicons>['name']; title: TKey; body: TKey }[] = [
  { icon: 'flash-outline', title: 'auth.welcome.rated', body: 'auth.welcome.ratedBody' },
  { icon: 'analytics-outline', title: 'auth.welcome.engine', body: 'auth.welcome.engineBody' },
  { icon: 'chatbubble-ellipses-outline', title: 'auth.welcome.learn', body: 'auth.welcome.learnBody' },
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
              <Text style={[styles.word, { color: c.text, fontFamily: t.fonts.displayMedium }]}>ChessMate</Text>
              <Text variant="overline" tone="muted" style={{ letterSpacing: 3 }}>
                {tr('brand.tagline')}
              </Text>
              <Text variant="slogan" style={{ marginTop: 6 }}>
                {tr('brand.slogan')}
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
              <SocialSignIn onSignedIn={() => router.replace('/')} />
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
            <BrandLine />
            <LanguagePicker includeSystem={false} compact />
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
  word: { fontSize: 40, lineHeight: 48, letterSpacing: 0, marginTop: 8 },
  feature: { flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18 },
  icon: { width: 38, height: 38, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: 10, alignItems: 'stretch' },
  guest: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
});
