import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { useHabits } from '@/lib/habits';
import { Button, GlassView, Text, useAppTheme } from '@/ui';

/** "1:05:09" or "4:12" for a break countdown. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/**
 * The current break (null when play is allowed), counting down once a second. The clock only
 * runs during a break: this sits on the home and play screens, and a clock ticking there all the
 * time kept the phone awake for nothing. A break starts as a change in the habits store (server
 * or device lock), which re-renders through useHabits and starts the countdown.
 */
export function usePlayLock(): { until: number | null; left: number } {
  const h = useHabits();
  const lockUntil = Math.max(h.habits?.lockedUntil ?? 0, h.deviceLock ?? 0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const first = Date.now();
    setNow(first);
    if (lockUntil <= first) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockUntil) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [lockUntil]);
  const until = lockUntil > now ? lockUntil : null;
  return { until, left: until ? until - now : 0 };
}

/**
 * Shown on play screens during a break from the player's own play limit:
 * when they can play again, with a countdown. Nothing during normal play.
 */
export function BreakBanner({ compact = false }: { compact?: boolean }) {
  const c = useAppTheme().colors;
  const tr = useT();
  const { until, left } = usePlayLock();
  if (!until) return null;
  const at = new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <GlassView radius="xl" padding={compact ? 'md' : 'lg'} style={{ gap: 10 }}>
      <View style={styles.row}>
        <View style={[styles.icon, { borderColor: c.borderStrong }]}>
          <Ionicons name="hourglass-outline" size={20} color={c.text} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{tr('limits.breakTitle')}</Text>
          <Text tone="muted">{tr('limits.breakBody', { time: at })}</Text>
        </View>
        <Text variant="numeric" style={styles.count}>
          {formatCountdown(left)}
        </Text>
      </View>
      {!compact && (
        <View style={styles.actions}>
          <Button size="sm" variant="secondary" title={tr('nav.puzzles')} onPress={() => router.push('/puzzles')} />
          <Button size="sm" variant="secondary" title={tr('more.learn')} onPress={() => router.navigate('/learn')} />
          <Button size="sm" variant="ghost" title={tr('limits.title')} onPress={() => router.push('/play-limits')} />
        </View>
      )}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 20, lineHeight: 26 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
