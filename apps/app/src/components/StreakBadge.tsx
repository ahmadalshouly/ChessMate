import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatCountdown } from '@/components/BreakBanner';
import { useTicker } from '@/components/PlayerBar';
import { useT } from '@/i18n';
import { useHabits } from '@/lib/habits';
import { Button, Modal, Text, useAppTheme } from '@/ui';

const FLAME = '#E8893A';

/**
 * Header streak: a flame with the days in a row you played. Grey when the
 * streak is at zero or today's game is still to play; tap for details.
 */
export function StreakBadge() {
  const c = useAppTheme().colors;
  const tr = useT();
  const { habits } = useHabits();
  const [open, setOpen] = useState(false);
  const now = useTicker(open);
  if (!habits) return null;
  const s = habits.streak;
  const lit = s.days > 0 && s.playedToday;
  const left = s.expiresAt ? s.expiresAt - now : 0;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('streak.a11y', { count: s.days })}
        onPress={() => setOpen(true)}
        hitSlop={6}
        style={({ pressed }) => [styles.badge, { borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}>
        <Ionicons name={lit ? 'flame' : 'flame-outline'} size={17} color={lit ? FLAME : c.muted} />
        <Text variant="numeric" style={styles.count} color={lit ? c.text : c.muted}>
          {s.days}
        </Text>
      </Pressable>
      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        title={tr('streak.title')}
        actions={<Button title={tr('common.close')} onPress={() => setOpen(false)} />}>
        <View style={{ gap: 14 }}>
          <View style={styles.big}>
            <Ionicons name={lit ? 'flame' : 'flame-outline'} size={44} color={lit ? FLAME : c.muted} />
            <View>
              <Text variant="display" style={{ fontSize: 44, lineHeight: 52 }}>
                {s.days}
              </Text>
              <Text tone="muted">{tr('streak.days', { count: s.days })}</Text>
            </View>
          </View>
          <Text>
            {s.days === 0
              ? tr('streak.start')
              : s.playedToday
                ? tr('streak.doneToday')
                : tr('streak.keepIt', { left: formatCountdown(Math.max(0, left)) })}
          </Text>
          <Text tone="muted">{tr('streak.best', { count: s.best })}</Text>
          <Text variant="caption" tone="tertiary">
            {tr('streak.rule')}
          </Text>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  count: { fontSize: 14, lineHeight: 18 },
  big: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
