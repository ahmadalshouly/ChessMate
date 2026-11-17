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
import { useArchive } from '@/lib/archive';
import { canDownload, downloadPgn, sharePgn } from '@/lib/share';

type Any = 'all';
const OUTCOMES = [
  { value: 'all', label: 'All' },
  { value: 'win', label: 'Won' },
  { value: 'loss', label: 'Lost' },
  { value: 'draw', label: 'Drawn' },
] as const;
const COLORS = [
  { value: 'all', label: 'Any' },
  { value: 'w', label: 'White' },
  { value: 'b', label: 'Black' },
] as const;
const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'bullet', label: 'Bullet' },
  { value: 'blitz', label: 'Blitz' },
  { value: 'rapid', label: 'Rapid' },
  { value: 'classical', label: 'Classical' },
] as const;
const SOURCES = [
  { value: 'all', label: 'All' },
  { value: 'online', label: 'Online' },
  { value: 'practice', label: 'Practice' },
  { value: 'import', label: 'Imported' },
] as const;

export default function GameHistory() {
  const t = useTheme();
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
    () => [{ value: 'all', label: 'All' }, ...openingFamilies(all).slice(0, 10).map((f) => ({ value: f.family, label: f.family }))],
    [all],
  );
  const activeFilters = [outcome, color, category, source, family].filter((v) => v !== 'all').length;

  const exportShown = async () => {
    if (!shown.length) return;
    const pgn = gamesToPgn(shown);
    if (canDownload) {
      downloadPgn(pgn, `chessmate-games-${new Date().toISOString().slice(0, 10)}.pgn`);
      setNotice(`Downloaded ${shown.length} game${shown.length === 1 ? '' : 's'}.`);
    } else {
      await sharePgn(pgn, 'ChessMate games');
    }
  };

  const header = (
    <View style={styles.headerWrap}>
      <Card>
        <View style={styles.stats}>
          <Stat label="Games" value={stats.total} />
          <Stat label="Won" value={stats.wins} />
          <Stat label="Lost" value={stats.losses} />
          <Stat label="Drawn" value={stats.draws} />
        </View>
      </Card>

      <Card>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search players, openings or ECO"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={[styles.search, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button variant="secondary" title={showFilters ? 'Hide filters' : activeFilters ? `Filters (${activeFilters})` : 'Filters'} onPress={() => setShowFilters((s) => !s)} />
          </View>
          <View style={styles.flex}>
            <Button variant="secondary" title="Import PGN" onPress={() => router.push('/games/import')} />
          </View>
          <View style={styles.flex}>
            <Button variant="secondary" title={canDownload ? 'Export' : 'Share all'} disabled={!shown.length} onPress={exportShown} />
          </View>
        </View>
        {showFilters && (
          <View style={styles.filters}>
            <ChipRow label="Result" options={OUTCOMES} value={outcome} onChange={setOutcome} />
            <ChipRow label="Played as" options={COLORS} value={color} onChange={setColor} />
            <ChipRow label="Time control" options={CATEGORIES} value={category} onChange={setCategory} />
            <ChipRow label="Source" options={SOURCES} value={source} onChange={setSource} />
            {families.length > 1 && <ChipRow label="Opening" options={families} value={family} onChange={setFamily} />}
            {activeFilters > 0 && (
              <Button
                variant="secondary"
                title="Clear filters"
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
      <Stack.Screen options={{ title: 'Game history' }} />
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
                <Label bold>{all.length ? 'No games match these filters' : 'No games yet'}</Label>
                <Label muted>
                  {all.length
                    ? 'Try clearing a filter or searching for something else.'
                    : 'Finished online and practice games appear here. You can also import games from a PGN file.'}
                </Label>
                {!all.length && <Button title="Play a game" onPress={() => router.push('/')} />}
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
