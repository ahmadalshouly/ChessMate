import type { TimeCategory } from '@chessmate/core';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/ui/primitives';
import { fonts } from '@/ui';

import { CountryFlag } from '@/components/CountryFlag';
import { Segmented as SegmentedControl } from '@/components/play/Controls';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import {
  LEADERBOARD_CATEGORIES,
  useLeaderboard,
  type LeaderboardEntry,
  type LeaderboardScope,
} from '@/lib/leaderboardApi';
import { formatNumber, translate, useT, type TKey } from '@/i18n';
import { countryLabel } from '@/i18n/chess';

const SCOPES: { key: LeaderboardScope; label: TKey }[] = [
  { key: 'global', label: 'leaderboard.global' },
  { key: 'country', label: 'profile.country.label' },
  { key: 'friends', label: 'home.friends.title' },
];

/**
 * Session token for the signed-in user. Accounts plug in here; without it
 * the Friends board asks the viewer to sign in and no "you" row is shown.
 */
const useSessionToken = (): string | null => null;

export default function LeaderboardScreen() {
  const t = useTheme();
  const tr = useT();
  const token = useSessionToken();
  const [category, setCategory] = useState<TimeCategory>('blitz');
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [countryInput, setCountryInput] = useState('');
  const country = scope === 'country' && /^[A-Za-z]{2}$/.test(countryInput) ? countryInput.toUpperCase() : null;
  const { page, error, loading, refresh, loadMore, hasMore } = useLeaderboard({ category, scope, country }, token);

  const header = (
    <View style={styles.headerWrap}>
      <Segmented
        options={LEADERBOARD_CATEGORIES.map((c) => ({ key: c, label: tr(`common.category.${c}`) }))}
        value={category}
        onChange={setCategory}
      />
      <Segmented options={SCOPES.map((o) => ({ ...o, label: tr(o.label) }))} value={scope} onChange={setScope} />
      {scope === 'country' && (
        <TextInput
          value={countryInput}
          onChangeText={(v) => setCountryInput(v.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase())}
          placeholder={page?.country ? tr('leaderboard.codeYours', { code: page.country }) : tr('leaderboard.codeExample')}
          placeholderTextColor={t.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />
      )}
      {page?.you && (
        <Card>
          <Text style={[styles.caption, { color: t.muted }]}>{tr('leaderboard.standing')}</Text>
          <Row entry={page.you} highlight />
        </Card>
      )}
      {page && (
        <View style={styles.flagLine}>
          {page.country ? <CountryFlag code={page.country} size={10} decorative /> : null}
          <Text style={[styles.caption, styles.shrink, { color: t.muted }]}>
            {page.country
              ? tr('leaderboard.rankedIn', { count: page.total, n: formatNumber(page.total), country: countryLabel(page.country) ?? page.country })
              : tr('leaderboard.ranked', { count: page.total, n: formatNumber(page.total) })}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={page?.entries ?? []}
        keyExtractor={(e) => e.userId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={styles.inner}>
            <Row entry={item} highlight={item.userId === page?.you?.userId} />
          </View>
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={loading && !!page} onRefresh={refresh} tintColor={t.text} />}
        ListEmptyComponent={
          <View style={styles.inner}>
            {loading ? (
              <ActivityIndicator color={t.text} style={{ marginTop: 32 }} />
            ) : (
              <Card>
                <Label bold>{error ? emptyTitle(error.status, scope) : tr('leaderboard.empty')}</Label>
                <Label muted>
                  {error
                    ? error.message
                    : scope === 'friends'
                      ? tr('leaderboard.emptyFriends')
                      : tr('leaderboard.emptyBody')}
                </Label>
                {error?.status === 0 && <Button variant="secondary" title={tr('common.tryAgain')} onPress={refresh} />}
              </Card>
            )}
          </View>
        }
        ListFooterComponent={hasMore ? <ActivityIndicator color={t.muted} style={{ marginVertical: 16 }} /> : undefined}
      />
    </Screen>
  );
}

function emptyTitle(status: number, scope: LeaderboardScope) {
  if (status === 401) return translate('leaderboard.signInFriends');
  if (status === 400 && scope === 'country') return translate('leaderboard.chooseCountry');
  return translate('leaderboard.unavailable');
}

function Row({ entry, highlight }: { entry: LeaderboardEntry; highlight?: boolean }) {
  const t = useTheme();
  const tr = useT();
  const podium = entry.rank <= 3;
  return (
    <View
      style={[styles.row, { borderColor: highlight ? t.text : t.glassBorder, backgroundColor: highlight ? t.surfaceSolid : t.surface }]}
      accessible
      accessibilityLabel={[tr('leaderboard.rowA11y', { rank: entry.rank, name: entry.displayName, rating: entry.rating }), countryLabel(entry.country)].filter(Boolean).join(', ')}>
      <View style={[styles.rank, podium && { backgroundColor: t.accent }]}>
        <Text style={[styles.rankText, { color: podium ? t.onAccent : t.muted }]}>{entry.rank}</Text>
      </View>
      <View style={styles.who}>
        <View style={styles.flagLine}>
          <CountryFlag code={entry.country} decorative />
          <Text style={[styles.name, styles.shrink, { color: t.text }]} numberOfLines={1}>
            {entry.displayName}
          </Text>
        </View>
        <Text style={[styles.sub, { color: t.muted }]} numberOfLines={1}>
          @{entry.username}
          {entry.games > 0 ? ` · ${tr('leaderboard.games', { count: entry.games })} · ${entry.wins}${tr('profile.w')} ${entry.draws}${tr('profile.d')} ${entry.losses}${tr('profile.l')}` : ''}
        </Text>
      </View>
      <View style={styles.score}>
        <Text style={[styles.rating, { color: t.text }]}>
          {entry.rating}
          {entry.provisional ? '?' : ''}
        </Text>
        <Text style={[styles.sub, { color: t.muted }]}>{tr('leaderboard.peak', { n: entry.peak })}</Text>
      </View>
    </View>
  );
}

function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return <SegmentedControl value={value} onChange={onChange} options={options.map((o) => ({ value: o.key, label: o.label }))} />;
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8, alignItems: 'stretch' },
  headerWrap: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: 12, marginBottom: 4 },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  caption: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 11, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  rank: { minWidth: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  rankText: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  who: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600' },
  flagLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shrink: { flexShrink: 1 },
  sub: { fontSize: 12 },
  score: { alignItems: 'flex-end' },
  rating: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
