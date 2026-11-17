import type { TimeCategory } from '@chessmate/core';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import {
  LEADERBOARD_CATEGORIES,
  countryFlag,
  useLeaderboard,
  type LeaderboardEntry,
  type LeaderboardScope,
} from '@/lib/leaderboardApi';

const SCOPES: { key: LeaderboardScope; label: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'country', label: 'Country' },
  { key: 'friends', label: 'Friends' },
];

/**
 * Session token for the signed-in user. Accounts plug in here; without it
 * the Friends board asks the viewer to sign in and no "you" row is shown.
 */
const useSessionToken = (): string | null => null;

export default function LeaderboardScreen() {
  const t = useTheme();
  const token = useSessionToken();
  const [category, setCategory] = useState<TimeCategory>('blitz');
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [countryInput, setCountryInput] = useState('');
  const country = scope === 'country' && /^[A-Za-z]{2}$/.test(countryInput) ? countryInput.toUpperCase() : null;
  const { page, error, loading, refresh, loadMore, hasMore } = useLeaderboard({ category, scope, country }, token);

  const header = (
    <View style={styles.headerWrap}>
      <Segmented
        options={LEADERBOARD_CATEGORIES.map((c) => ({ key: c, label: c[0]!.toUpperCase() + c.slice(1) }))}
        value={category}
        onChange={setCategory}
      />
      <Segmented options={SCOPES} value={scope} onChange={setScope} />
      {scope === 'country' && (
        <TextInput
          value={countryInput}
          onChangeText={(v) => setCountryInput(v.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase())}
          placeholder={page?.country ? `Country code (yours: ${page.country})` : 'Country code, e.g. US'}
          placeholderTextColor={t.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />
      )}
      {page?.you && (
        <Card>
          <Text style={[styles.caption, { color: t.muted }]}>Your standing</Text>
          <Row entry={page.you} highlight />
        </Card>
      )}
      {page && (
        <Text style={[styles.caption, { color: t.muted }]}>
          {page.total.toLocaleString()} ranked {page.total === 1 ? 'player' : 'players'}
          {page.country ? ` in ${countryFlag(page.country)} ${page.country}` : ''}
        </Text>
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
                <Label bold>{error ? emptyTitle(error.status, scope) : 'No ranked players yet'}</Label>
                <Label muted>
                  {error
                    ? error.message
                    : scope === 'friends'
                      ? 'Add friends and play rated games to see how you compare.'
                      : 'Players appear here once their rating settles after a few rated games.'}
                </Label>
                {error?.status === 0 && <Button variant="secondary" title="Try again" onPress={refresh} />}
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
  if (status === 401) return 'Sign in to see friends';
  if (status === 400 && scope === 'country') return 'Choose a country';
  return 'Leaderboard unavailable';
}

function Row({ entry, highlight }: { entry: LeaderboardEntry; highlight?: boolean }) {
  const t = useTheme();
  const podium = entry.rank <= 3;
  return (
    <View
      style={[styles.row, { borderColor: highlight ? t.text : t.glassBorder, backgroundColor: highlight ? t.surfaceSolid : t.surface }]}
      accessible
      accessibilityLabel={`Rank ${entry.rank}, ${entry.displayName}, rating ${entry.rating}`}>
      <View style={[styles.rank, podium && { backgroundColor: t.accent }]}>
        <Text style={[styles.rankText, { color: podium ? t.onAccent : t.muted }]}>{entry.rank}</Text>
      </View>
      <View style={styles.who}>
        <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
          {entry.country ? `${countryFlag(entry.country)} ` : ''}
          {entry.displayName}
        </Text>
        <Text style={[styles.sub, { color: t.muted }]} numberOfLines={1}>
          @{entry.username}
          {entry.games > 0 ? ` · ${entry.games} games · ${entry.wins}W ${entry.draws}D ${entry.losses}L` : ''}
        </Text>
      </View>
      <View style={styles.score}>
        <Text style={[styles.rating, { color: t.text }]}>
          {entry.rating}
          {entry.provisional ? '?' : ''}
        </Text>
        <Text style={[styles.sub, { color: t.muted }]}>peak {entry.peak}</Text>
      </View>
    </View>
  );
}

function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.segment, { borderColor: t.glassBorder, backgroundColor: t.surface }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={[styles.segmentItem, on && { backgroundColor: t.accent }]}>
            <Text style={[styles.segmentText, { color: on ? t.onAccent : t.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8, alignItems: 'stretch' },
  headerWrap: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: 12, marginBottom: 4 },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  caption: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 11, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  rank: { minWidth: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  rankText: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  who: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 12 },
  score: { alignItems: 'flex-end' },
  rating: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
