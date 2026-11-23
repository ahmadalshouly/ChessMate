import Ionicons from '@expo/vector-icons/Ionicons';
import type { AdminPlayerSummary } from '@chessmate/core';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, PageHeader, PlayerRow, Section } from '@/features/admin/ui';
import type { PlayerFilter } from '@/lib/adminApi';
import { useT } from '@/i18n';
import { Button, Chip, Row, Stack, Text, TextField, useAppTheme } from '@/ui';

const FILTERS: PlayerFilter[] = ['all', 'active', 'closed', 'muted', 'staff'];

export default function AdminPlayers() {
  const tr = useT();
  const { colors: c } = useAppTheme();
  const { api } = useAdmin();
  const params = useLocalSearchParams<{ filter?: string; q?: string }>();
  const [query, setQuery] = useState(params.q ?? '');
  const [debounced, setDebounced] = useState(query);
  const [filter, setFilter] = useState<PlayerFilter>(FILTERS.includes(params.filter as PlayerFilter) ? (params.filter as PlayerFilter) : 'all');
  const [players, setPlayers] = useState<AdminPlayerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      .players(debounced, filter)
      .then((r) => {
        if (!live) return;
        setPlayers(r.players);
        setTotal(r.total);
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [api, debounced, filter, tick]);

  const more = async () => {
    setLoading(true);
    try {
      const r = await api.players(debounced, filter, players.length);
      setPlayers((p) => [...p, ...r.players]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminPage onRefresh={() => setTick((n) => n + 1)} refreshing={loading && players.length > 0}>
      <PageHeader title={tr('admin.nav.players')} subtitle={tr('admin.players.subtitle')} />
      <Stack gap="md">
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={tr('admin.players.search')}
          autoCapitalize="none"
          autoCorrect={false}
          left={<Ionicons name="search" size={16} color={c.muted} />}
          accessibilityLabel={tr('admin.players.search')}
        />
        <Row gap="xs" wrap>
          {FILTERS.map((f) => (
            <Chip key={f} label={tr(`admin.players.filters.${f}`)} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </Row>
      </Stack>
      <ErrorLine message={error} />
      <Section title={tr('admin.players.count', { count: total })} padding="none">
        {players.length === 0 && !loading ? (
          <EmptyState icon="people-outline" title={tr('admin.players.empty')} />
        ) : (
          players.map((p, i) => <PlayerRow key={p.id} p={p} last={i === players.length - 1} />)
        )}
        {loading && players.length === 0 ? (
          <Text tone="muted" style={{ padding: 16 }}>
            {tr('admin.common.loading')}
          </Text>
        ) : null}
      </Section>
      {players.length < total && filter !== 'muted' && <Button title={tr('admin.common.loadMore')} variant="secondary" loading={loading} onPress={() => void more()} />}
    </AdminPage>
  );
}
