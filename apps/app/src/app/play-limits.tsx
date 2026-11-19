import { PLAY_LIMIT_COOLDOWN_CHOICES, PLAY_LIMIT_RANGES, PLAY_LIMIT_WINDOW_CHOICES, loosens, type PlayLimitSettings } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BreakBanner, usePlayLock } from '@/components/BreakBanner';
import { Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { saveLimits, useHabits } from '@/lib/habits';
import { useSocialIdentity } from '@/lib/social/session';
import { Button, GlassView, Switch, Text, useAppTheme } from '@/ui';

/** "30 min", "2 h", "1 day". */
function useDuration() {
  const tr = useT();
  return (min: number) => (min % 1440 === 0 ? tr('limits.days', { count: min / 1440 }) : min % 60 === 0 ? tr('limits.hours', { count: min / 60 }) : tr('limits.minutes', { count: min }));
}

/**
 * Play limits: "after N games within W, take a break of C". The server
 * enforces the break; during it the limit can only be made stricter.
 */
export default function PlayLimits() {
  const tr = useT();
  const c = useAppTheme().colors;
  const me = useSocialIdentity();
  const { habits } = useHabits();
  const { until } = usePlayLock();
  const duration = useDuration();
  const saved = habits?.limits ?? null;
  const [draft, setDraft] = useState<PlayLimitSettings | null>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (saved) setDraft((d) => d ?? saved);
  }, [saved]);

  if (!me) {
    return (
      <Screen>
        <Stack.Screen options={{ title: tr('limits.title') }} />
        <View style={styles.page}>
          <GlassView radius="xl" padding="lg" style={{ gap: 12, maxWidth: 480 }}>
            <Text variant="heading">{tr('limits.title')}</Text>
            <Text tone="muted">{tr('limits.signIn')}</Text>
            <Button title={tr('auth.signIn')} onPress={() => router.push('/sign-in')} />
          </GlassView>
        </View>
      </Screen>
    );
  }

  const onBreak = !!until && !!saved?.enabled;
  // During a break, anything that allows more play is greyed out (the server refuses it too).
  const blocked = (next: PlayLimitSettings) => onBreak && !!saved && loosens(saved, next);
  const change = (patch: Partial<PlayLimitSettings>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    if (blocked(next)) return;
    setDraft(next);
    setDone(false);
  };
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const h = await saveLimits(draft);
      setDraft(h.limits);
      setError(null);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('limits.title') }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          <View style={{ gap: 6 }}>
            <Text variant="title">{tr('limits.title')}</Text>
            <Text tone="muted">{tr('limits.intro')}</Text>
          </View>
          <BreakBanner compact />
          {draft && (
            <GlassView radius="xl" padding="lg" style={{ gap: 20 }}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="subheading">{tr('limits.enable')}</Text>
                  <Text variant="caption" tone="muted">
                    {draft.enabled ? tr('limits.summary', { games: draft.maxGames, window: duration(draft.windowMinutes), cooldown: duration(draft.cooldownMinutes) }) : tr('limits.off')}
                  </Text>
                </View>
                <Switch value={draft.enabled} onValueChange={(v) => change({ enabled: v })} disabled={onBreak && draft.enabled} accessibilityLabel={tr('limits.enable')} />
              </View>

              <View style={{ gap: 10, opacity: draft.enabled ? 1 : 0.5 }}>
                <Text variant="label">{tr('limits.games')}</Text>
                <View style={styles.stepper}>
                  <Step icon="remove" onPress={() => change({ maxGames: Math.max(PLAY_LIMIT_RANGES.maxGames.min, draft.maxGames - 1) })} disabled={!draft.enabled} />
                  <Text variant="figure" style={{ minWidth: 56, textAlign: 'center' }}>
                    {draft.maxGames}
                  </Text>
                  <Step
                    icon="add"
                    onPress={() => change({ maxGames: Math.min(PLAY_LIMIT_RANGES.maxGames.max, draft.maxGames + 1) })}
                    disabled={!draft.enabled || blocked({ ...draft, maxGames: draft.maxGames + 1 })}
                  />
                </View>

                <Text variant="label">{tr('limits.window')}</Text>
                <Chips
                  values={PLAY_LIMIT_WINDOW_CHOICES}
                  value={draft.windowMinutes}
                  label={duration}
                  isBlocked={(v) => !draft.enabled || blocked({ ...draft, windowMinutes: v })}
                  onChange={(v) => change({ windowMinutes: v })}
                />

                <Text variant="label">{tr('limits.cooldown')}</Text>
                <Chips
                  values={PLAY_LIMIT_COOLDOWN_CHOICES}
                  value={draft.cooldownMinutes}
                  label={duration}
                  isBlocked={(v) => !draft.enabled || blocked({ ...draft, cooldownMinutes: v })}
                  onChange={(v) => change({ cooldownMinutes: v })}
                />
              </View>

              {draft.enabled && habits && !onBreak && saved?.enabled && (
                <Text tone="muted">{tr('limits.progress', { played: habits.gamesInWindow, games: saved.maxGames, window: duration(saved.windowMinutes) })}</Text>
              )}
              {onBreak && (
                <View style={[styles.note, { borderColor: c.border }]}>
                  <Ionicons name="lock-closed-outline" size={16} color={c.muted} />
                  <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                    {tr('limits.lockedNote')}
                  </Text>
                </View>
              )}
              {error && (
                <Text variant="caption" tone="danger">
                  {serverText(error)}
                </Text>
              )}
              <Button title={done && !dirty ? tr('limits.saved') : tr('limits.save')} onPress={save} loading={busy} disabled={!dirty} />
            </GlassView>
          )}
          <GlassView radius="xl" padding="lg" style={{ gap: 8 }}>
            <Text variant="heading">{tr('limits.howTitle')}</Text>
            <Text style={{ lineHeight: 23 }}>{tr('limits.how')}</Text>
          </GlassView>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Step({ icon, onPress, disabled }: { icon: 'add' | 'remove'; onPress: () => void; disabled?: boolean }) {
  const c = useAppTheme().colors;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.step, { borderColor: c.border, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}>
      <Ionicons name={icon} size={20} color={c.text} />
    </Pressable>
  );
}

function Chips({ values, value, label, isBlocked, onChange }: { values: readonly number[]; value: number; label: (v: number) => string; isBlocked: (v: number) => boolean; onChange: (v: number) => void }) {
  const c = useAppTheme().colors;
  return (
    <View style={styles.chips}>
      {values.map((v) => {
        const on = v === value;
        const off = !on && isBlocked(v);
        return (
          <Pressable
            key={v}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: off }}
            disabled={off}
            onPress={() => onChange(v)}
            style={[styles.chip, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.surface, opacity: off ? 0.35 : 1 }]}>
            <Text variant="label" color={on ? c.onAccent : c.text}>
              {label(v)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10 },
});
