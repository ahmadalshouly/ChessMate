import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AD_SPOTS, type AdSpotId } from '@chessmate/core';

import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { useAuth } from '@/lib/auth';
import { tournamentsApi } from '@/lib/tournamentsApi';
import { Button, GlassView, Text, TextField, useAppTheme } from '@/ui';
import { KeyboardScrollView } from '@/ui/components/Keyboard';
import { goBack } from '@/lib/goBack';

/** "Sponsor a tournament": anyone can apply; the team reviews it and gets in touch. */
export default function SponsorApply() {
  const insets = useSafeAreaInsets();
  const t = useAppTheme();
  const tr = useT();
  const { user } = useAuth();
  const [f, setF] = useState({ name: user?.username ?? '', email: user?.email ?? '', company: '', website: '', budget: '', message: '' });
  /** Null means "no preference": the team picks a spot for them. */
  const [spot, setSpot] = useState<AdSpotId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await tournamentsApi.applySponsor({ ...f, company: f.company || null, website: f.website || null, budget: f.budget || null, spot });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardScrollView contentContainerStyle={[styles.page, { paddingBottom: 40 + insets.bottom }]}>
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
            <Button variant="secondary" title={tr('tournaments.back')} onPress={() => goBack('/tournaments')} />
          </GlassView>
        ) : (
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
            <TextField label={tr('tournaments.sponsor.name')} value={f.name} onChangeText={set('name')} maxLength={80} />
            <TextField label={tr('tournaments.sponsor.email')} value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" maxLength={120} />
            <TextField label={tr('tournaments.sponsor.company')} value={f.company} onChangeText={set('company')} maxLength={80} />
            <TextField label={tr('tournaments.sponsor.website')} value={f.website} onChangeText={set('website')} autoCapitalize="none" placeholder="https://" maxLength={200} />
            <TextField label={tr('tournaments.sponsor.budget')} value={f.budget} onChangeText={set('budget')} maxLength={80} />
            <View style={{ gap: t.space.xs }}>
              <Text variant="overline" tone="muted">
                {tr('ads.apply.spotLabel')}
              </Text>
              <View style={styles.spots}>
                {[null, ...AD_SPOTS].map((s) => {
                  const on = spot === s;
                  return (
                    <Pressable
                      key={s ?? 'any'}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => setSpot(s)}
                      style={({ pressed }) => [
                        styles.spot,
                        { borderColor: on ? t.colors.accent : t.colors.border, backgroundColor: on ? t.colors.accent : 'transparent', opacity: pressed ? 0.8 : 1 },
                      ]}>
                      <Text variant="caption" color={on ? t.colors.onAccent : t.colors.text}>
                        {s ? tr(`ads.spot.${s}`) : tr('ads.apply.spotAny')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text variant="caption" tone="tertiary">
                {tr('ads.apply.spotHint')}
              </Text>
            </View>
            <TextField label={tr('tournaments.sponsor.message')} value={f.message} onChangeText={set('message')} multiline maxLength={2000} placeholder={tr('tournaments.sponsor.messageHint')} />
            {error && <Text tone="danger">{serverText(error)}</Text>}
            <Button title={tr('tournaments.sponsor.submit')} loading={busy} disabled={!f.name.trim() || !f.email.trim() || f.message.trim().length < 10} onPress={() => void submit()} />
          </GlassView>
        )}
      </View>
    </KeyboardScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center', paddingBottom: 40 },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH },
  spots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  spot: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
});
