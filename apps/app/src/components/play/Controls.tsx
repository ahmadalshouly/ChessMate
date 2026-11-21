import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { useT } from '@/i18n';
import { fonts } from '@/ui';
import { Text } from '@/ui/primitives';

/**
 * Segmented control: one choice out of a few. A sunken track with the chosen option
 * raised on a glass chip, the same language as the tab and settings controls.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  const t = useTheme();
  const dark = t.scheme === 'dark';
  return (
    <View style={[styles.segment, { borderColor: t.border, backgroundColor: t.surfaceSunken }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: o.disabled }}
            disabled={o.disabled}
            onPress={() => onChange(o.value)}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.segmentItem,
              { height: size === 'sm' ? 30 : 36 },
              on && [styles.segmentOn, { backgroundColor: dark ? 'rgba(255,255,255,0.11)' : '#FFFFFF', borderColor: t.glassBorder }],
              !on && hovered && { backgroundColor: t.surfacePressed },
              o.disabled && { opacity: 0.35 },
            ]}>
            <Text style={[styles.segmentText, { color: on ? t.text : t.muted, fontFamily: on ? fonts.sansSemiBold : fonts.sansMedium }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Time-control tile: a big mono "3+2" with a small caption under it. Selected tiles
 * invert to solid ink. `live` shows a small dot for players waiting in that pool.
 */
export function Tile({ title, caption, selected, onPress, live }: { title: string; caption?: string; selected: boolean; onPress: () => void; live?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.tile,
        {
          borderColor: selected ? t.accent : hovered ? t.borderStrong : t.border,
          backgroundColor: selected ? t.accent : hovered ? t.surfacePressed : t.surface,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}>
      {live && <View style={[styles.liveDot, { backgroundColor: t.live }]} />}
      <Text style={[styles.tileTitle, { color: selected ? t.onAccent : t.text }]}>{title}</Text>
      {caption ? (
        <Text numberOfLines={1} style={[styles.tileCaption, { color: selected ? t.onAccent : t.textTertiary, opacity: selected ? 0.7 : 1 }]}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** − value + stepper. */
export function Stepper({ label, value, onDec, onInc }: { label: string; value: string; onDec: () => void; onInc: () => void }) {
  const t = useTheme();
  const tr = useT();
  const btn = (icon: string, fn: () => void, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={fn}
      hitSlop={4}
      style={({ pressed }) => [styles.stepBtn, { borderColor: t.border, backgroundColor: pressed ? t.surfacePressed : t.surface }]}>
      <Text style={[styles.stepBtnText, { color: t.text }]}>{icon}</Text>
    </Pressable>
  );
  return (
    <View style={styles.stepRow}>
      <Text style={[styles.stepLabel, { color: t.muted }]}>{label}</Text>
      {btn('−', onDec, tr('common.less', { label }))}
      <Text style={[styles.stepValue, { color: t.text }]}>{value}</Text>
      {btn('+', onInc, tr('common.more', { label }))}
    </View>
  );
}

export function Row({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap }}>{children}</View>;
}

/** Small mono status pill. `strong` inverts to ink; `live` adds a pulsing-green dot. */
export function Pill({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'strong' | 'live' }) {
  const t = useTheme();
  const strong = tone === 'strong';
  return (
    <View style={[styles.pill, { borderColor: strong ? t.accent : t.border, backgroundColor: strong ? t.accent : t.surfaceSunken }]}>
      {tone === 'live' && <View style={[styles.pillDot, { backgroundColor: t.live }]} />}
      <Text style={[styles.pillText, { color: strong ? t.onAccent : t.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, padding: 3, gap: 2 },
  segmentItem: { flex: 1, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  segmentOn: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  segmentText: { fontSize: 13.5, letterSpacing: -0.1 },
  tile: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', minHeight: 62, gap: 4 },
  liveDot: { position: 'absolute', top: 9, right: 9, width: 6, height: 6, borderRadius: 3 },
  tileTitle: { fontFamily: fonts.monoMedium, fontSize: 21, lineHeight: 24, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  tileCaption: { fontFamily: fonts.label, fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepLabel: { fontFamily: fonts.label, fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', width: 92 },
  stepBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 18, lineHeight: 20 },
  stepValue: { fontFamily: fonts.monoMedium, fontSize: 20, minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'], letterSpacing: -0.8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, height: 24 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', fontVariant: ['tabular-nums'] },
});
