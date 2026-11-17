import { COUNTRIES, countryFlag, countryName } from '@chessmate/core';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Button, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';

import { Field } from './controls';

export function CountryPicker({ value, onChange }: { value: string | null; onChange: (code: string | null) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? COUNTRIES.filter(([c, n]) => n.toLowerCase().includes(s) || c.toLowerCase() === s) : COUNTRIES;
  }, [q]);
  const pick = (code: string | null) => {
    onChange(code);
    setOpen(false);
    setQ('');
  };
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>Country</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Country"
        onPress={() => setOpen(true)}
        style={[styles.select, { borderColor: t.border, backgroundColor: t.surface }]}>
        <Text style={{ color: value ? t.text : t.muted, fontSize: 15 }}>{value ? `${countryFlag(value)}  ${countryName(value)}` : 'Not set'}</Text>
        <Text style={{ color: t.muted }}>▾</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <Screen>
          <View style={styles.modal}>
            <Field label="Search countries" value={q} onChangeText={setQ} placeholder="Type a country" autoFocus autoCorrect={false} />
            <FlatList
              data={[['', 'Not set'] as const, ...list]}
              keyExtractor={([c]) => c || 'none'}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: [code, name] }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => pick(code || null)}
                  style={({ pressed }) => [styles.item, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}>
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: (code || null) === value ? '700' : '400' }}>
                    {code ? `${countryFlag(code)}  ` : ''}
                    {name}
                  </Text>
                </Pressable>
              )}
            />
            <Button variant="secondary" title="Cancel" onPress={() => setOpen(false)} />
          </View>
        </Screen>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  select: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between' },
  modal: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', padding: 16, paddingTop: 56, gap: 12 },
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
