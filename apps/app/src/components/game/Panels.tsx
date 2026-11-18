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

/** A notice floating over the top of the board (draw offer, confirm move, opponent gone), with optional buttons. */
export function BoardNotice({ icon, text, children, strong }: { icon: GameIconName; text: string; children?: ReactNode; strong?: boolean }) {
  const c = useAppTheme().colors;
  return (
    <View style={[styles.notice, { borderColor: strong ? c.borderStrong : c.glassBorder, backgroundColor: c.surfaceSolid }]}>
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
  panel: { paddingTop: 6 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, height: 46 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  confirm: { padding: 18, gap: 6 },
  confirmHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confirmButtons: { flexDirection: 'row', gap: 8, marginTop: 10 },
  confirmBtn: { flex: 1, height: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth },
  noticeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
});

/**
 * What an action button does, before it does it: icon, title, a line of
 * explanation, and Cancel / confirm buttons. Pops up above the action bar.
 */
export function ConfirmPanel({
  icon,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: {
  icon: GameIconName;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  const c = useAppTheme().colors;
  const tr = useT();
  const bg = danger ? c.danger : c.accent;
  const fg = danger ? c.onDanger : c.onAccent;
  return (
    <GlassView radius="xl" strength="strong" elevation="lg" style={styles.confirm}>
      <View style={styles.confirmHead}>
        <GameIcon name={icon} size={22} color={danger ? c.danger : c.text} />
        <Text variant="heading" style={{ flex: 1 }}>
          {title}
        </Text>
      </View>
      {body ? <Text tone="muted">{body}</Text> : null}
      <View style={styles.confirmButtons}>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={({ pressed }) => [styles.confirmBtn, { borderColor: c.border, backgroundColor: pressed ? c.surfacePressed : c.surfaceSunken }]}>
          <Text variant="bodyStrong">{tr('common.cancel')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onConfirm}
          style={({ pressed }) => [styles.confirmBtn, { borderColor: bg, backgroundColor: bg, opacity: pressed ? 0.85 : 1 }]}>
          <GameIcon name={icon} size={18} color={fg} />
          <Text variant="bodyStrong" color={fg}>
            {confirmLabel}
          </Text>
        </Pressable>
      </View>
    </GlassView>
  );
}
