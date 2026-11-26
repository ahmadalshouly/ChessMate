import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ReviewMark } from '@/components/ReviewButton';
import { GlassView, REVIEW_BLACK, Text, useAppTheme } from '@/ui';

export type GameIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function GameIcon({ name, size = 22, color }: { name: GameIconName; size?: number; color: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

export interface GameAction {
  key: string;
  icon: GameIconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Toggled on: the panel it opens is showing. */
  active?: boolean;
  /** Draws attention: a pending offer, a new chat message. */
  dot?: boolean;
  danger?: boolean;
  /** Repeats while held (move back / forward). */
  repeat?: boolean;
  /** Opens the game review: black with the "!!" badge, like every Review button. */
  review?: boolean;
}

/**
 * The bar under the board: one row of icon buttons with a short label, each
 * centred in an equal slot. Chat and More toggle panels in place, so the
 * board never leaves the screen.
 */
export function ActionBar({ actions }: { actions: GameAction[] }) {
  const t = useAppTheme();
  const c = t.colors;
  return (
    <GlassView radius="xl" elevation="sm" strength="strong" style={styles.bar}>
      {actions.map((a) => {
        const fg = a.active ? c.onAccent : a.danger ? c.danger : c.text;
        const review = a.review && !a.active;
        return (
          <Pressable
            key={a.key}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            accessibilityState={{ disabled: !!a.disabled, selected: !!a.active }}
            disabled={a.disabled}
            onPress={a.onPress}
            delayLongPress={300}
            onLongPress={a.repeat ? a.onPress : undefined}
            style={styles.slot}>
            {({ pressed }) => (
              <View
                style={[
                  styles.item,
                  a.active && { backgroundColor: c.accent },
                  review && { backgroundColor: REVIEW_BLACK },
                  review && c.scheme === 'dark' && styles.reviewEdge,
                  !a.active && pressed && { backgroundColor: review ? '#26262B' : c.surfacePressed },
                  { opacity: a.disabled ? 0.32 : 1 },
                ]}>
                <View>
                  {review ? <ReviewMark size={24} /> : <GameIcon name={a.icon} color={fg} />}
                  {a.dot && <View style={[styles.dot, { backgroundColor: c.danger, borderColor: a.active ? c.accent : c.surfaceSolid }]} />}
                </View>
                <Text variant="caption" color={a.active ? c.onAccent : review ? '#FFFFFF' : a.danger ? c.danger : c.muted} numberOfLines={1} style={styles.label}>
                  {a.label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', padding: 4, gap: 2 },
  slot: { flex: 1, minWidth: 0 },
  item: { alignItems: 'center', justifyContent: 'center', gap: 2, height: 54, borderRadius: 22, paddingHorizontal: 2 },
  label: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
  reviewEdge: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  dot: { position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
});
