import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { useTheme } from '@/constants/theme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string | null;
  hint?: string;
  /** Renders a show/hide toggle and masks input. */
  password?: boolean;
};

export const TextField = forwardRef<TextInputInstance, Props>(function TextField({ label, error, hint, password, onFocus, onBlur, ...input }, ref) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error ? t.danger : focused ? t.text : t.border;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: t.text }]} nativeID={`${label}-label`}>
        {label}
      </Text>
      <View style={[styles.box, { borderColor, backgroundColor: t.surface }]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          aria-invalid={!!error}
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={password && !revealed}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: t.text }, { outlineStyle: 'none' } as object]}
          {...input}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={8}
            onPress={() => setRevealed((r) => !r)}
            style={styles.toggle}>
            <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>{revealed ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.note, { color: t.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.note, { color: t.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
});

/** Four-segment strength meter shown under a new password. */
export function StrengthMeter({ score, visible }: { score: 0 | 1 | 2 | 3; visible: boolean }) {
  const t = useTheme();
  if (!visible) return null;
  const labels = ['Too short', 'Okay', 'Good', 'Strong'] as const;
  return (
    <View style={styles.meterRow} accessibilityLabel={`Password strength: ${labels[score]}`}>
      <View style={styles.meter}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.seg, { backgroundColor: i <= score && score > 0 ? t.text : t.border }]} />
        ))}
      </View>
      <Text style={{ color: score === 0 ? t.danger : t.muted, fontSize: 12, fontWeight: '600' }}>{labels[score]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, minHeight: 48 },
  input: { flex: 1, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  toggle: { paddingHorizontal: 14, paddingVertical: 10 },
  note: { fontSize: 13, lineHeight: 18 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -6 },
  meter: { flex: 1, flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
});
