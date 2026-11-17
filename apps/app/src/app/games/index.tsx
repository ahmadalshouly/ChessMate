import {
  archiveStats,
  filterGames,
  gamesToPgn,
  openingFamilies,
  type Color,
  type GameFilter,
  type GameSource,
  type TimeCategory,
  type ViewerOutcome,
} from '@chessmate/core';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { TextInput } from '@/ui/primitives';

import { ChipRow, GameRow, Stat } from '@/components/archive';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { useT, type TKey } from '@/i18n';
import { useArchive } from '@/lib/archive';
import { canDownload, downloadPgn, sharePgn } from '@/lib/share';

type Any = 'all';
type Option<T extends string> = { value: T; label: TKey };
const OUTCOMES: Option<ViewerOutcome | Any>[] = [
  { value: 'all', label: 'games.filter.all' },
  { value: 'win', label: 'profile.won' },
  { value: 'loss', label: 'profile.lost' },
  { value: 'draw', label: 'profile.drawn' },
];
const COLORS: Option<Color | Any>[] = [
  { value: 'all', label: 'games.filter.any' },
  { value: 'w', label: 'play.white' },
  { value: 'b', label: 'play.black' },
];
const CATEGORIES: Option<TimeCategory | Any>[] = [
  { value: 'all', label: 'games.filter.all' },
  { value: 'bullet', label: 'common.category.bullet' },
  { value: 'blitz', label: 'common.category.blitz' },
  { value: 'rapid', label: 'common.category.rapid' },
  { value: 'classical', label: 'common.category.classical' },
];
const SOURCES: Option<GameSource | Any>[] = [
  { value: 'all', label: 'games.filter.all' },
  { value: 'online', label: 'games.source.online' },
  { value: 'practice', label: 'games.source.practice' },
  { value: 'import', label: 'games.source.import' },
];

export default function GameHistory() {
  const t = useTheme();
  const tr = useT();
  const opts = <T extends string>(list: Option<T>[]) => list.map((o) => ({ value: o.value, label: tr(o.label) }));
  const { games, loading } = useArchive();
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<ViewerOutcome | Any>('all');
  const [color, setColor] = useState<Color | Any>('all');
  const [category, setCategory] = useState<TimeCategory | Any>('all');
  const [source, setSource] = useState<GameSource | Any>('all');
  const [family, setFamily] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const all = games ?? [];
  const filter: GameFilter = {
    query: query || undefined,
    outcome: outcome === 'all' ? undefined : outcome,
    color: color === 'all' ? undefined : color,
    category: category === 'all' ? undefined : category,
    source: source === 'all' ? undefined : source,
    openingFamily: family === 'all' ? undefined : family,
  };
  const shown = useMemo(() => filterGames(all, filter), [all, JSON.stringify(filter)]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => archiveStats(shown), [shown]);
  const families = useMemo(
    () => [{ value: 'all', label: tr('games.filter.all') }, ...openingFamilies(all).slice(0, 10).map((f) => ({ value: f.family, label: f.family }))],
    [all, tr],
  );
  const activeFilters = [outcome, color, category, source, family].filter((v) => v !== 'all').length;

  const exportShown = async () => {
    if (!shown.length) return;
    const pgn = gamesToPgn(shown);
    if (canDownload) {
      downloadPgn(pgn, `chessmate-games-${new Date().toISOString().slice(0, 10)}.pgn`);
      setNotice(tr('games.downloaded', { count: shown.length }));
    } else {
      await sharePgn(pgn, tr('games.shareTitle'));
    }
  };

  const header = (
    <View style={styles.headerWrap}>
      <Card>
        <View style={styles.stats}>
          <Stat label={tr('profile.games')} value={stats.total} />
          <Stat label={tr('profile.won')} value={stats.wins} />
          <Stat label={tr('profile.lost')} value={stats.losses} />
          <Stat label={tr('profile.drawn')} value={stats.draws} />
        </View>
      </Card>

      <Card>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tr('games.search')}
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={[styles.search, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button variant="secondary" title={showFilters ? tr('games.hideFilters') : activeFilters ? tr('games.filtersCount', { n: activeFilters }) : tr('games.filters')} onPress={() => setShowFilters((s) => !s)} />
          </View>
          <View style={styles.flex}>
            <Button variant="secondary" title={tr('games.importPgn')} onPress={() => router.push('/games/import')} />
          </View>
          <View style={styles.flex}>
            <Button variant="secondary" title={canDownload ? tr('games.export') : tr('games.shareAll')} disabled={!shown.length} onPress={exportShown} />
          </View>
        </View>
        {showFilters && (
          <View style={styles.filters}>
            <ChipRow label={tr('games.filter.result')} options={opts(OUTCOMES)} value={outcome} onChange={setOutcome} />
            <ChipRow label={tr('games.filter.playedAs')} options={opts(COLORS)} value={color} onChange={setColor} />
            <ChipRow label={tr('games.filter.timeControl')} options={opts(CATEGORIES)} value={category} onChange={setCategory} />
            <ChipRow label={tr('games.filter.source')} options={opts(SOURCES)} value={source} onChange={setSource} />
            {families.length > 1 && <ChipRow label={tr('games.filter.opening')} options={families} value={family} onChange={setFamily} />}
            {activeFilters > 0 && (
              <Button
                variant="secondary"
                title={tr('games.clearFilters')}
                onPress={() => {
                  setOutcome('all');
                  setColor('all');
                  setCategory('all');
                  setSource('all');
                  setFamily('all');
                }}
              />
            )}
          </View>
        )}
        {notice && <Label muted>{notice}</Label>}
      </Card>
    </View>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('games.title') }} />
      <FlatList
        data={shown}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.page}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <GameRow game={item} onPress={() => router.push({ pathname: '/games/[id]', params: { id: item.id } })} />
          </View>
        )}
        ListEmptyComponent={
          loading ? undefined : (
            <View style={styles.item}>
              <Card>
                <Label bold>{all.length ? tr('games.noMatch') : tr('games.empty')}</Label>
                <Label muted>
                  {all.length
                    ? tr('games.noMatchBody')
                    : tr('games.emptyBody')}
                </Label>
                {!all.length && <Button title={tr('games.playAGame')} onPress={() => router.push('/')} />}
              </Card>
            </View>
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48 },
  headerWrap: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 12, marginBottom: 12, alignSelf: 'center' },
  item: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  stats: { flexDirection: 'row' },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  filters: { gap: 12, marginTop: 4 },
});
