import { COUNTRIES } from '@chessmate/core';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Button, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { CountryFlag } from '@/components/CountryFlag';
import { countryLabel } from '@/i18n/chess';

import { Field } from './controls';

export function CountryPicker({ value, onChange }: { value: string | null; onChange: (code: string | null) => void }) {
  const t = useTheme();
  const { tr, lang, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  // Names in the current language, sorted for that language; English names still match a search.
  const all = useMemo(
    () => COUNTRIES.map(([c, en]) => [c, countryLabel(c) ?? en, en] as const).sort((a, b) => a[1].localeCompare(b[1], locale)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );
  const list = useMemo(() => {
    const s = q.trim().toLocaleLowerCase();
    return (s ? all.filter(([c, n, en]) => n.toLocaleLowerCase().includes(s) || en.toLowerCase().includes(s) || c.toLowerCase() === s) : all).map(([c, n]) => [c, n] as const);
  }, [q, all]);
  const pick = (code: string | null) => {
    onChange(code);
    setOpen(false);
    setQ('');
  };
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>{tr('profile.country.label')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('profile.country.label')}
        onPress={() => setOpen(true)}
        style={[styles.select, { borderColor: t.border, backgroundColor: t.surface }]}>
        <View style={styles.choice}>
          <CountryFlag code={value} size={14} decorative />
          <Text style={{ color: value ? t.text : t.muted, fontSize: 15, flexShrink: 1 }}>{value ? countryLabel(value) : tr('profile.country.notSet')}</Text>
        </View>
        <Text style={{ color: t.muted }}>▾</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <Screen>
          <View style={styles.modal}>
            <Field label={tr('profile.country.search')} value={q} onChangeText={setQ} placeholder={tr('profile.country.placeholder')} autoFocus autoCorrect={false} />
            <FlatList
              data={[['', tr('profile.country.notSet')] as const, ...list]}
              keyExtractor={([c]) => c || 'none'}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: [code, name] }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => pick(code || null)}
                  style={({ pressed }) => [styles.item, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}>
                  <View style={styles.choice}>
                    <CountryFlag code={code} size={14} decorative />
                    <Text style={{ color: t.text, fontSize: 16, fontWeight: (code || null) === value ? '700' : '400', flexShrink: 1 }}>{name}</Text>
                  </View>
                </Pressable>
              )}
            />
            <Button variant="secondary" title={tr('common.cancel')} onPress={() => setOpen(false)} />
          </View>
        </Screen>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  select: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modal: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', padding: 16, paddingTop: 56, gap: 12 },
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
});
