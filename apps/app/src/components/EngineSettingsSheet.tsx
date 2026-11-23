import { Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { DEPTH_CHOICES, LINE_CHOICES, SECONDS_CHOICES, DEFAULT_ENGINE_SETTINGS, setEngineSettings, useEngineSettings } from '@/lib/engineSettings';
import { Button, Modal, Stack, Switch, Text, useAppTheme } from '@/ui';

/**
 * Analysis board engine settings: on/off, depth, number of lines, think time,
 * arrows and move grades. Saved on this device and used straight away.
 */
export function EngineSettingsSheet({
  visible,
  onClose,
  engineOn,
  onEngineOn,
}: {
  visible: boolean;
  onClose: () => void;
  engineOn: boolean;
  onEngineOn: (on: boolean) => void;
}) {
  const tr = useT();
  const s = useEngineSettings();
  return (
    <Modal
      visible={visible}
      onClose={onClose}
      presentation="sheet"
      title={tr('analysis.settings.title')}
      description={tr('analysis.settings.body')}
      actions={
        <>
          <Button variant="ghost" title={tr('analysis.settings.reset')} onPress={() => setEngineSettings(DEFAULT_ENGINE_SETTINGS)} />
          <Button title={tr('common.close')} onPress={onClose} />
        </>
      }>
      <Stack gap="lg">
        <ToggleRow label={tr('analysis.engine')} value={engineOn} onChange={onEngineOn} />
        <Choice
          label={tr('analysis.settings.depth')}
          hint={tr('analysis.settings.depthHint')}
          options={DEPTH_CHOICES.map((d) => ({ value: d, label: String(d) }))}
          value={s.depth}
          onChange={(depth) => setEngineSettings({ depth })}
        />
        <Choice
          label={tr('analysis.settings.lines')}
          options={LINE_CHOICES.map((n) => ({ value: n, label: String(n) }))}
          value={s.lines}
          onChange={(lines) => setEngineSettings({ lines })}
        />
        <Choice
          label={tr('analysis.settings.time')}
          hint={tr('analysis.settings.timeHint')}
          options={SECONDS_CHOICES.map((n) => ({ value: n, label: tr('analysis.settings.seconds', { n }) }))}
          value={s.seconds}
          onChange={(seconds) => setEngineSettings({ seconds })}
        />
        <ToggleRow label={tr('analysis.settings.arrows')} value={s.arrows} onChange={(arrows) => setEngineSettings({ arrows })} />
        <ToggleRow label={tr('analysis.settings.grades')} value={s.grades} onChange={(grades) => setEngineSettings({ grades })} />
      </Stack>
    </Modal>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

function Choice<T extends number>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useAppTheme().colors;
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">{label}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : pressed ? c.surfacePressed : c.surface },
              ]}>
              <Text variant="label" color={on ? c.onAccent : c.text}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint && (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 48, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
});
