import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { useT } from '@/i18n';

/** Glass segmented control: one choice out of a few. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segment, { borderColor: t.scheme === 'light' ? t.border : t.glassBorder, backgroundColor: t.surface }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: o.disabled }}
            disabled={o.disabled}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, on && { backgroundColor: t.accent }, o.disabled && { opacity: 0.4 }]}>
            <Text style={[styles.segmentText, { color: on ? t.onAccent : t.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Time-control tile: big "3+2", a caption under it. */
export function Tile({ title, caption, selected, onPress }: { title: string; caption?: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          borderColor: selected ? t.accent : t.scheme === 'light' ? t.border : t.glassBorder,
          backgroundColor: selected ? t.accent : t.surface,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <Text style={[styles.tileTitle, { color: selected ? t.onAccent : t.text }]}>{title}</Text>
      {caption ? <Text style={[styles.tileCaption, { color: selected ? t.onAccent : t.muted }]}>{caption}</Text> : null}
    </Pressable>
  );
}

/** − value + stepper. */
export function Stepper({ label, value, onDec, onInc }: { label: string; value: string; onDec: () => void; onInc: () => void }) {
  const t = useTheme();
  const tr = useT();
  const btn = (txt: string, fn: () => void, a11y: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={fn} style={[styles.stepBtn, { borderColor: t.glassBorder, backgroundColor: t.surface }]}>
      <Text style={[styles.stepBtnText, { color: t.text }]}>{txt}</Text>
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

export function Pill({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'strong' }) {
  const t = useTheme();
  const strong = tone === 'strong';
  return (
    <View style={[styles.pill, { borderColor: t.glassBorder, backgroundColor: strong ? t.accent : t.surface }]}>
      <Text style={[styles.pillText, { color: strong ? t.onAccent : t.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 3 },
  segmentItem: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '600' },
  tile: { borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 64 },
  tileTitle: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tileCaption: { fontSize: 12, marginTop: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepLabel: { fontSize: 14, width: 92 },
  stepBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 20, fontWeight: '600' },
  stepValue: { fontSize: 18, fontWeight: '700', minWidth: 72, textAlign: 'center', fontVariant: ['tabular-nums'] },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '600' },
});
