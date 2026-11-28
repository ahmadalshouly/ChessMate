import { FOOTBALL_LEAGUES, footballClub, searchFootballClubs, type FootballClub } from '@chessmate/core';
import { useMemo, useState } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { Field } from '@/features/profile/controls';
import { useT } from '@/i18n';
import { BackdropContext } from '@/ui';
import { Text } from '@/ui/primitives';

import { ClubCrest } from './ClubBadge';

/** Football Mate: pick the club you support, grouped by league, with search. */
export function ClubPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const t = useTheme();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = footballClub(value);
  const sections = useMemo(() => {
    const found = searchFootballClubs(q);
    return FOOTBALL_LEAGUES.map((league) => ({ league, data: found.filter((c) => c.league === league) })).filter((s) => s.data.length > 0);
  }, [q]);
  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQ('');
  };
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>{tr('football.label')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('football.label')}
        onPress={() => setOpen(true)}
        style={[styles.select, { borderColor: t.border, backgroundColor: t.surface }]}>
        <View style={styles.choice}>
          {current && <ClubCrest club={current} size={22} />}
          <Text style={{ color: current ? t.text : t.muted, fontSize: 15, flexShrink: 1 }}>{current ? current.name : tr('football.notSet')}</Text>
        </View>
        <Text style={{ color: t.muted }}>▾</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        {/* A modal is its own window, so it paints its own themed background (see CountryPicker). */}
        <BackdropContext value={false}>
          <Screen>
            <View style={styles.modal}>
              <Field label={tr('football.search')} value={q} onChangeText={setQ} placeholder={tr('football.placeholder')} autoFocus autoCorrect={false} />
              <SectionList
                sections={sections}
                keyExtractor={(c) => c.id}
                keyboardShouldPersistTaps="handled"
                stickySectionHeadersEnabled={false}
                ListHeaderComponent={
                  value ? <Row label={tr('football.notSet')} selected={false} onPress={() => pick(null)} border={t.border} color={t.muted} /> : undefined
                }
                ListEmptyComponent={<Text style={{ color: t.muted, paddingVertical: 16 }}>{tr('football.noResults', { q: q.trim() })}</Text>}
                renderSectionHeader={({ section }) => (
                  <Text style={[styles.league, { color: t.muted }]}>{tr(`football.leagues.${section.league}`)}</Text>
                )}
                renderItem={({ item }) => <Row club={item} label={item.name} selected={item.id === value} onPress={() => pick(item.id)} border={t.border} color={t.text} />}
              />
              <Button variant="secondary" title={tr('common.cancel')} onPress={() => setOpen(false)} />
            </View>
          </Screen>
        </BackdropContext>
      </Modal>
    </View>
  );
}

function Row({ club, label, selected, onPress, border, color }: { club?: FootballClub; label: string; selected: boolean; onPress: () => void; border: string; color: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.item, { borderColor: border, opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.choice}>
        {club ? <ClubCrest club={club} size={32} /> : <View style={{ width: (32 * 24) / 28 }} />}
        <Text style={{ color, fontSize: 16, fontWeight: selected ? '700' : '400', flexShrink: 1 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  select: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modal: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', padding: 16, paddingTop: 56, gap: 12 },
  league: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', paddingTop: 16, paddingBottom: 4 },
  item: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
});
