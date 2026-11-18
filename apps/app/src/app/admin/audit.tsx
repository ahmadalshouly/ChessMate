import type { AdminAuditEntry } from '@chessmate/core';
import { useState } from 'react';

import { useAdmin } from '@/features/admin/AdminContext';
import { AuditRow } from '@/features/admin/AuditRow';
import { AdminPage, EmptyState, ErrorLine, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { useT } from '@/i18n';
import { Button, Chip, Row } from '@/ui';

const FILTERS = ['all', 'account', 'chat', 'player', 'rating', 'role', 'fairplay', 'report', 'game', 'title', 'note'] as const;
type Filter = (typeof FILTERS)[number];

export default function AdminAudit() {
  const tr = useT();
  const { api } = useAdmin();
  const [filter, setFilter] = useState<Filter>('all');
  const [extra, setExtra] = useState<AdminAuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const action = filter === 'all' ? undefined : filter;
  const { data, loading, reload, error: loadError } = useLoad(() => {
    setExtra([]);
    return api.audit({ action });
  }, [api, action]);
  const entries = [...(data ?? []), ...extra];
  const more = async () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    try {
      const next = await api.audit({ action, before: last.at });
      setExtra((e) => [...e, ...next]);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader title={tr('admin.nav.audit')} subtitle={tr('admin.audit.subtitle')} right={<Button title={tr('admin.common.refresh')} variant="secondary" size="sm" loading={loading} onPress={reload} />} />
      <Row gap="xs" wrap>
        {FILTERS.map((f) => (
          <Chip key={f} label={tr(`admin.audit.filters.${f}`)} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </Row>
      <ErrorLine message={error ?? loadError} />
      <Section title={tr(`admin.audit.filters.${filter}`)} padding="none">
        {data && entries.length === 0 ? <EmptyState icon="document-text-outline" title={tr('admin.audit.empty')} /> : entries.map((e, i) => <AuditRow key={e.id} e={e} last={i === entries.length - 1} />)}
      </Section>
      {entries.length >= 50 && <Button title={tr('admin.common.loadMore')} variant="secondary" onPress={() => void more()} />}
    </AdminPage>
  );
}
