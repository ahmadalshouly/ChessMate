import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/auth/AuthShell';
import { LanguageChips } from '@/components/i18n/LanguageChips';
import { Button, Card, Label, Screen } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useT } from '@/i18n';

const FEATURES = [
  { icon: '♟', title: 'auth.welcome.rated', body: 'auth.welcome.ratedBody' },
  { icon: '◎', title: 'auth.welcome.engine', body: 'auth.welcome.engineBody' },
  { icon: '✦', title: 'auth.welcome.coach', body: 'auth.welcome.coachBody' },
] as const;

export default function Welcome() {
  const t = useTheme();
  const { continueAsGuest } = useAuth();
  const tr = useT();

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.column}>
            <View style={styles.hero}>
              <BrandMark size={72} />
              <Text style={[styles.brand, { color: t.text }]}>ChessMate</Text>
              <Label muted size={17}>
                {tr('home.heroTitle')}
              </Label>
            </View>

            <Card>
              {FEATURES.map((f) => (
                <View key={f.title} style={styles.feature}>
                  <View style={[styles.icon, { borderColor: t.glassBorder, backgroundColor: t.surface }]}>
                    <Text style={{ color: t.text, fontSize: 18 }}>{f.icon}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Label bold>{tr(f.title)}</Label>
                    <Label muted size={14}>
                      {tr(f.body)}
                    </Label>
                  </View>
                </View>
              ))}
            </Card>

            <View style={styles.actions}>
              <Button title={tr('auth.welcome.createAccount')} onPress={() => router.push('/sign-up')} />
              <Button title={tr('auth.signIn')} variant="secondary" onPress={() => router.push('/sign-in')} />
              <Text
                accessibilityRole="button"
                onPress={async () => {
                  await continueAsGuest();
                  router.replace('/');
                }}
                style={[styles.guest, { color: t.muted }]}>
                {tr('auth.continueAsGuest')}
              </Text>
              <Label muted size={12}>
                {tr('auth.welcome.guestNote')}
              </Label>
            </View>
            <LanguageChips />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16, paddingVertical: 40 },
  column: { width: '100%', maxWidth: 420, gap: 24 },
  hero: { alignItems: 'center', gap: 6 },
  brand: { fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  feature: { flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 4 },
  icon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: 12, alignItems: 'stretch' },
  guest: { textAlign: 'center', fontSize: 15, fontWeight: '600', paddingVertical: 8, textDecorationLine: 'underline' },
});
