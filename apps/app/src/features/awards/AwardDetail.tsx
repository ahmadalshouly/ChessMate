import Ionicons from '@expo/vector-icons/Ionicons';
import { AWARDS_BY_ID, type AwardProgress, type AwardsView } from '@chessmate/core';
import { StyleSheet, View } from 'react-native';

import { formatDate, useT } from '@/i18n';
import { countryLabel } from '@/i18n/chess';
import { countryFlag } from '@/lib/leaderboardApi';
import { Modal, Row, Stack, Text, useAppTheme } from '@/ui';

import { AwardBadge } from './AwardBadge';
import { awardGoal, awardName, tierColor, tierName } from './catalog';

/** One award: its levels, what each asks for, and when they were earned. */
export function AwardDetail({ award, view, onClose }: { award: AwardProgress | null; view: AwardsView | null; onClose: () => void }) {
  const tr = useT();
  const c = useAppTheme().colors;
  const def = award ? AWARDS_BY_ID.get(award.id) : undefined;
  const countries = award?.id === 'countries.played' ? view?.countries : award?.id === 'countries.beaten' ? view?.countriesBeaten : undefined;
  return (
    <Modal visible={!!award} onClose={onClose} presentation="sheet" title={award ? awardName(award.id) : ''}>
      {award && def && (
        <Stack gap="lg">
          <Row gap="lg">
            <AwardBadge id={award.id} level={award.level} maxLevel={award.maxLevel} size="lg" />
            <Stack gap="xs" style={{ flex: 1 }}>
              <Text variant="overline" tone="muted">
                {award.level ? tierName(award.level) : tr('awards.locked')}
              </Text>
              <Text variant="bodyStrong">{award.next !== null ? awardGoal(award.id, award.next) : tr('awards.maxed')}</Text>
              {award.next !== null && <ProgressBar value={award.value} from={award.current} to={award.next} />}
              <Text variant="caption" tone="muted">
                {award.next !== null ? tr('awards.progress', { value: award.value, next: award.next }) : tr('awards.value', { value: award.value })}
              </Text>
            </Stack>
          </Row>
          <Stack gap="sm">
            <Text variant="overline" tone="muted">
              {tr('awards.levels')}
            </Text>
            {def.levels.map((threshold, i) => {
              const level = i + 1;
              const earned = view?.earned.find((e) => e.id === award.id && e.level === level);
              const done = award.level >= level;
              return (
                <Row key={level} gap="md">
                  <Ionicons name={done ? 'checkmark-circle' : 'lock-closed-outline'} size={18} color={done ? tierColor(level) : c.textTertiary} />
                  <Stack gap="none" style={{ flex: 1 }}>
                    <Text variant="label" tone={done ? 'default' : 'muted'}>
                      {tierName(level)} · {awardGoal(award.id, threshold)}
                    </Text>
                    {earned && (
                      <Text variant="caption" tone="muted">
                        {tr('awards.earnedOn', { date: formatDate(earned.earnedAt) })}
                      </Text>
                    )}
                  </Stack>
                </Row>
              );
            })}
          </Stack>
          {countries && countries.length > 0 && (
            <Stack gap="sm">
              <Text variant="overline" tone="muted">
                {tr('awards.countriesTitle')}
              </Text>
              <View style={styles.flags}>
                {countries.map((code) => (
                  <View key={code} accessible accessibilityLabel={countryLabel(code) ?? code} style={[styles.flag, { borderColor: c.border }]}>
                    <Text>{countryFlag(code)}</Text>
                    <Text variant="caption" tone="muted">
                      {countryLabel(code) ?? code}
                    </Text>
                  </View>
                ))}
              </View>
            </Stack>
          )}
        </Stack>
      )}
    </Modal>
  );
}

/** Progress from the current level's threshold to the next one. */
export function ProgressBar({ value, from, to }: { value: number; from: number; to: number }) {
  const t = useAppTheme();
  const pct = to > from ? Math.min(1, Math.max(0, (value - from) / (to - from))) : 1;
  return (
    <View style={[styles.track, { backgroundColor: t.colors.border }]}>
      <View style={[styles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: t.colors.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
