import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/constants/theme';

/** Pill-style segmented control for small option sets. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.segmented, { borderColor: t.border, backgroundColor: t.surface }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: t.accent }]}>
            <Text numberOfLines={1} style={{ color: on ? t.onAccent : t.text, fontWeight: on ? '600' : '400', fontSize: 14 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: 15 }}>{title}</Text>
        {detail ? <Text style={{ color: t.muted, fontSize: 13 }}>{detail}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function ToggleRow({ title, detail, value, onChange }: { title: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Row title={title} detail={detail}>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: t.border, true: t.accent }}
        thumbColor={value ? t.onAccent : t.surfaceSolid}
        ios_backgroundColor={t.border}
        // react-native-web ignores trackColor.true/thumbColor for the "on" state.
        {...({ activeThumbColor: t.onAccent, activeTrackColor: t.accent } as object)}
      />
    </Row>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        accessibilityLabel={label}
        {...props}
        style={[styles.input, { color: t.text, borderColor: error ? t.danger : t.border, backgroundColor: t.surface }, props.multiline && { minHeight: 88, textAlignVertical: 'top' }]}
      />
      {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function SectionTitle({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>{children}</Text>;
}

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 3 },
  segment: { flex: 1, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 9, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
