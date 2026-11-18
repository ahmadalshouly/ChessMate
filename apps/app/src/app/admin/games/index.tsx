import Ionicons from '@expo/vector-icons/Ionicons';
import type { AdminGameSummary } from '@chessmate/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, GameRow, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { useT } from '@/i18n';
import { Button, Row, TextField, useAppTheme } from '@/ui';

/** Game ids are short random strings; usernames are 3 to 20 word characters. Try the id first. */
export default function AdminGames() {
  const tr = useT();
  const { colors: c } = useAppTheme();
  const { api } = useAdmin();
  const params = useLocalSearchParams<{ player?: string }>();
  const [input, setInput] = useState(params.player ?? '');
  const [player, setPlayer] = useState(params.player ?? '');
  const [extra, setExtra] = useState<AdminGameSummary[]>([]);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, loading, reload, error: loadError } = useLoad(() => {
    setExtra([]);
    return api.games(player || undefined);
  }, [api, player]);
  const games = [...(data ?? []), ...extra];

  const find = async () => {
    const q = input.trim();
    setError(null);
    if (!q) return setPlayer('');
    setFinding(true);
    try {
      await api.game(q);
      router.push(`/admin/games/${encodeURIComponent(q)}`);
    } catch {
      setPlayer(q);
    } finally {
      setFinding(false);
    }
  };
  const more = async () => {
    const last = games[games.length - 1];
    if (!last) return;
    try {
      const next = await api.games(player || undefined, last.startedAt);
      setExtra((e) => [...e, ...next]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader title={tr('admin.nav.games')} subtitle={tr('admin.games.subtitle')} />
      <Row gap="sm" align="flex-end">
        <TextField
          containerStyle={{ flex: 1 }}
          value={input}
          onChangeText={setInput}
          placeholder={tr('admin.games.search')}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => void find()}
          left={<Ionicons name="search" size={16} color={c.muted} />}
          accessibilityLabel={tr('admin.games.search')}
        />
        <Button title={tr('admin.games.find')} loading={finding} onPress={() => void find()} />
      </Row>
      <ErrorLine message={error ?? loadError} />
      <Section title={player ? player : tr('admin.games.recent')} padding="none">
        {data && games.length === 0 ? <EmptyState icon="grid-outline" title={tr('admin.games.empty')} /> : games.map((g, i) => <GameRow key={g.id} g={g} tr={tr} last={i === games.length - 1} />)}
      </Section>
      {games.length >= 30 && <Button title={tr('admin.common.loadMore')} variant="secondary" onPress={() => void more()} />}
    </AdminPage>
  );
}
