import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { useAuth } from '@/lib/auth';
import { tournamentsApi } from '@/lib/tournamentsApi';
import { Button, GlassView, Text, TextField, useAppTheme } from '@/ui';

/** "Sponsor a tournament": anyone can apply; the team reviews it and gets in touch. */
export default function SponsorApply() {
  const insets = useSafeAreaInsets();
  const t = useAppTheme();
  const tr = useT();
  const { user } = useAuth();
  const [f, setF] = useState({ name: user?.username ?? '', email: user?.email ?? '', company: '', website: '', budget: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await tournamentsApi.applySponsor({ ...f, company: f.company || null, website: f.website || null, budget: f.budget || null });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 40 + insets.bottom }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: tr('tournaments.sponsor.title') }} />
      <View style={[styles.inner, { gap: t.space.lg }]}>
        <View style={{ gap: t.space.sm }}>
          <Text variant="title">{tr('tournaments.sponsor.title')}</Text>
          <Text tone="muted">{tr('tournaments.sponsor.intro')}</Text>
        </View>
        {sent ? (
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.md, alignItems: 'flex-start' }}>
            <Ionicons name="checkmark-circle" size={28} color={t.colors.success} />
            <Text variant="heading">{tr('tournaments.sponsor.thanksTitle')}</Text>
            <Text tone="muted">{tr('tournaments.sponsor.thanksBody')}</Text>
            <Button variant="secondary" title={tr('tournaments.back')} onPress={() => router.back()} />
          </GlassView>
        ) : (
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
            <TextField label={tr('tournaments.sponsor.name')} value={f.name} onChangeText={set('name')} maxLength={80} />
            <TextField label={tr('tournaments.sponsor.email')} value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" maxLength={120} />
            <TextField label={tr('tournaments.sponsor.company')} value={f.company} onChangeText={set('company')} maxLength={80} />
            <TextField label={tr('tournaments.sponsor.website')} value={f.website} onChangeText={set('website')} autoCapitalize="none" placeholder="https://" maxLength={200} />
            <TextField label={tr('tournaments.sponsor.budget')} value={f.budget} onChangeText={set('budget')} maxLength={80} />
            <TextField label={tr('tournaments.sponsor.message')} value={f.message} onChangeText={set('message')} multiline maxLength={2000} placeholder={tr('tournaments.sponsor.messageHint')} />
            {error && <Text tone="danger">{serverText(error)}</Text>}
            <Button title={tr('tournaments.sponsor.submit')} loading={busy} disabled={!f.name.trim() || !f.email.trim() || f.message.trim().length < 10} onPress={() => void submit()} />
          </GlassView>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center', paddingBottom: 40 },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH },
});
