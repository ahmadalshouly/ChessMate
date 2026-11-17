import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/auth/AuthShell';
import { SocialSignIn } from '@/components/auth/SocialSignIn';
import { Button, Card, Label, Screen } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

const FEATURES = [
  { icon: '♟', title: 'Rated games, any time', body: 'Bullet to classical against players at your level.' },
  { icon: '◎', title: 'Engine insight', body: 'Evaluation, accuracy and the best line after every game.' },
  { icon: '✦', title: 'A coach that explains', body: 'Threats and move feedback in plain language, as you play.' },
];

export default function Welcome() {
  const t = useTheme();
  const { continueAsGuest } = useAuth();

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.column}>
            <View style={styles.hero}>
              <BrandMark size={72} />
              <Text style={[styles.brand, { color: t.text }]}>ChessMate</Text>
              <Label muted size={17}>
                Play. Learn. Improve.
              </Label>
            </View>

            <Card>
              {FEATURES.map((f) => (
                <View key={f.title} style={styles.feature}>
                  <View style={[styles.icon, { borderColor: t.glassBorder, backgroundColor: t.surface }]}>
                    <Text style={{ color: t.text, fontSize: 18 }}>{f.icon}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Label bold>{f.title}</Label>
                    <Label muted size={14}>
                      {f.body}
                    </Label>
                  </View>
                </View>
              ))}
            </Card>

            <View style={styles.actions}>
              <Button title="Create free account" onPress={() => router.push('/sign-up')} />
              <Button title="Sign in" variant="secondary" onPress={() => router.push('/sign-in')} />
              <SocialSignIn onSignedIn={() => router.replace('/')} />
              <Text
                accessibilityRole="button"
                onPress={async () => {
                  await continueAsGuest();
                  router.replace('/');
                }}
                style={[styles.guest, { color: t.muted }]}>
                Continue as guest
              </Text>
              <Label muted size={12}>
                Guests can play casual games and use the practice board. Ratings and history need an account.
              </Label>
            </View>
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
