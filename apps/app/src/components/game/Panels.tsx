import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { GlassView, Text, useAppTheme } from '@/ui';

import { GameIcon, type GameIconName } from './ActionBar';

export interface OptionItem {
  key: string;
  icon: GameIconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/** The "More" panel: a short list of game options, opened over the dock. */
export function OptionsPanel({ title, items, onClose }: { title: string; items: OptionItem[]; onClose: () => void }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  return (
    <GlassView radius="lg" strength="strong" elevation="md" style={styles.panel}>
      <View style={styles.head}>
        <Text variant="label" tone="muted" style={{ flex: 1 }}>
          {title}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('game.close')} onPress={onClose} hitSlop={8} style={styles.close}>
          <GameIcon name="close" size={18} color={c.muted} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 6 }}>
        {items.map((it) => (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            disabled={it.disabled}
            onPress={it.onPress}
            style={({ pressed }) => [styles.item, pressed && { backgroundColor: c.surfacePressed }, it.disabled && { opacity: 0.35 }]}>
            <GameIcon name={it.icon} size={20} color={it.danger ? c.danger : c.text} />
            <Text variant="bodyStrong" color={it.danger ? c.danger : c.text}>
              {it.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </GlassView>
  );
}

/** A one-line notice in the dock (draw offer, confirm move, opponent gone), with optional buttons. */
export function DockNotice({ icon, text, children, strong }: { icon: GameIconName; text: string; children?: ReactNode; strong?: boolean }) {
  const c = useAppTheme().colors;
  return (
    <View style={[styles.notice, { borderColor: strong ? c.borderStrong : c.border, backgroundColor: strong ? c.surfaceStrong : c.surfaceSunken }]}>
      <GameIcon name={icon} size={18} color={c.text} />
      <Text variant="label" style={{ flex: 1 }} numberOfLines={2}>
        {text}
      </Text>
      {children}
    </View>
  );
}

/** Small pill button for notices: icon plus a short word. */
export function NoticeButton({ icon, label, onPress, primary }: { icon?: GameIconName; label: string; onPress: () => void; primary?: boolean }) {
  const c = useAppTheme().colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.noticeBtn,
        { backgroundColor: primary ? c.accent : c.surface, borderColor: primary ? c.accent : c.border, opacity: pressed ? 0.8 : 1 },
      ]}>
      {icon && <GameIcon name={icon} size={16} color={primary ? c.onAccent : c.text} />}
      <Text variant="label" color={primary ? c.onAccent : c.text}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, paddingTop: 6 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, height: 46 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, margin: 6, marginBottom: 0 },
  noticeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
});
