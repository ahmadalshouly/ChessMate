import { MAINTENANCE_LIMITS, maintenanceInForce, type MaintenanceState } from '@chessmate/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, ErrorLine, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { parseLocalInput, toLocalInput } from '@/features/maintenance/time';
import { recheckMaintenance } from '@/features/maintenance/useMaintenance';
import { formatDateTime, useT } from '@/i18n';
import { Button, Chip, Row, Stack, Switch, Text, TextField, useToast } from '@/ui';

const PRESETS: { key: string; minutes: number }[] = [
  { key: '15m', minutes: 15 },
  { key: '30m', minutes: 30 },
  { key: '1h', minutes: 60 },
  { key: '2h', minutes: 120 },
  { key: '1d', minutes: 1440 },
];

/** Admin → Maintenance: switch the web maintenance page on and off, with its title, text and an optional countdown. Admins only. */
export default function AdminMaintenance() {
  const tr = useT();
  const { api } = useAdmin();
  const { data, error, loading, reload } = useLoad(() => api.maintenance(), [api]);
  const [saved, setSaved] = useState<MaintenanceState | null>(null);
  const state = saved ?? data ?? null;
  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader title={tr('admin.nav.maintenance')} subtitle={tr('admin.maintenance.subtitle')} />
      <ErrorLine message={error} />
      {/* Keyed on the last change, so the form starts again from what the server saved. */}
      {state ? <MaintenanceForm key={state.updatedAt ?? 0} state={state} onSaved={setSaved} /> : null}
    </AdminPage>
  );
}

function MaintenanceForm({ state, onSaved }: { state: MaintenanceState; onSaved: (s: MaintenanceState) => void }) {
  const tr = useT();
  const { api } = useAdmin();
  const toast = useToast();
  const [title, setTitle] = useState(state.title);
  const [description, setDescription] = useState(state.description);
  const [timer, setTimer] = useState(state.endsAt != null);
  const [endsText, setEndsText] = useState(state.endsAt != null ? toLocalInput(state.endsAt) : '');
  const [autoEnd, setAutoEnd] = useState(state.autoEnd);
  const [busy, setBusy] = useState(false);

  const endsAt = timer ? parseLocalInput(endsText) : null;
  const timeError = timer && endsText.trim() && endsAt == null ? tr('admin.maintenance.timeInvalid') : null;
  const live = maintenanceInForce(state);

  const save = async (active: boolean) => {
    if (timer && endsAt == null) {
      toast.show({
        title: tr('admin.maintenance.timeInvalid'),
        tone: 'danger',
      });
      return;
    }
    setBusy(true);
    try {
      const next = await api.setMaintenance({
        active,
        title,
        description,
        endsAt,
        autoEnd: timer && autoEnd,
      });
      onSaved(next);
      void recheckMaintenance();
      toast.show({
        title: tr(next.active === state.active ? 'admin.maintenance.saved' : next.active ? 'admin.maintenance.turnedOn' : 'admin.maintenance.turnedOff'),
        tone: 'success',
      });
    } catch (e) {
      toast.show({
        title: e instanceof Error ? e.message : tr('admin.common.failed'),
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="lg">
      <Section title={tr('admin.maintenance.statusTitle')}>
        <Row justify="space-between" gap="md">
          <Stack gap="xs" style={{ flex: 1 }}>
            <Text variant="subheading" tone={live ? 'warning' : 'default'}>
              {tr(live ? 'admin.maintenance.on' : state.active ? 'admin.maintenance.ended' : 'admin.maintenance.off')}
            </Text>
            <Text variant="caption" tone="muted">
              {tr('admin.maintenance.switchBody')}
            </Text>
            {state.updatedAt ? (
              <Text variant="caption" tone="tertiary">
                {tr('admin.maintenance.lastChange', {
                  name: state.updatedBy ?? '?',
                  date: formatDateTime(state.updatedAt),
                })}
              </Text>
            ) : null}
          </Stack>
          <Switch value={state.active} disabled={busy} onValueChange={(v) => void save(v)} accessibilityLabel={tr('admin.maintenance.statusTitle')} />
        </Row>
      </Section>

      <Section title={tr('admin.maintenance.pageTitle')}>
        <Stack gap="md">
          <TextField label={tr('admin.maintenance.title')} value={title} onChangeText={setTitle} maxLength={MAINTENANCE_LIMITS.title} placeholder={tr('maintenance.defaultTitle')} />
          <TextField label={tr('admin.maintenance.description')} value={description} onChangeText={setDescription} multiline maxLength={MAINTENANCE_LIMITS.description} placeholder={tr('maintenance.defaultBody')} />
          <Text variant="caption" tone="tertiary">
            {tr('admin.maintenance.emptyHint')}
          </Text>

          <Row justify="space-between" gap="md">
            <Stack gap="xs" style={{ flex: 1 }}>
              <Text variant="subheading">{tr('admin.maintenance.timer')}</Text>
              <Text variant="caption" tone="muted">
                {tr('admin.maintenance.timerBody')}
              </Text>
            </Stack>
            <Switch
              value={timer}
              onValueChange={(v) => {
                setTimer(v);
                if (v && !endsText) setEndsText(toLocalInput(Date.now() + 60 * 60_000));
              }}
              accessibilityLabel={tr('admin.maintenance.timer')}
            />
          </Row>
          {timer ? (
            <Stack gap="sm">
              <TextField
                label={tr('admin.maintenance.endsAt')}
                value={endsText}
                onChangeText={setEndsText}
                placeholder="2026-12-01 18:00"
                autoCapitalize="none"
                error={timeError}
                helper={
                  endsAt
                    ? tr('admin.maintenance.endsAtHelper', {
                        date: formatDateTime(endsAt),
                      })
                    : tr('admin.maintenance.endsAtFormat')
                }
              />
              <Row gap="sm" wrap>
                {PRESETS.map((p) => (
                  <Chip key={p.key} label={tr(`admin.maintenance.presets.${p.key}` as 'admin.maintenance.presets.1h')} onPress={() => setEndsText(toLocalInput(Date.now() + p.minutes * 60_000))} />
                ))}
              </Row>
              <Row justify="space-between" gap="md">
                <Stack gap="xs" style={{ flex: 1 }}>
                  <Text variant="subheading">{tr('admin.maintenance.autoEnd')}</Text>
                  <Text variant="caption" tone="muted">
                    {tr('admin.maintenance.autoEndBody')}
                  </Text>
                </Stack>
                <Switch value={autoEnd} onValueChange={setAutoEnd} accessibilityLabel={tr('admin.maintenance.autoEnd')} />
              </Row>
            </Stack>
          ) : null}

          <Row gap="sm" wrap>
            <Button size="sm" title={tr(state.active ? 'admin.maintenance.save' : 'admin.maintenance.saveAndTurnOn')} loading={busy} disabled={!!timeError} onPress={() => void save(true)} />
            {state.active ? <Button size="sm" variant="secondary" title={tr('admin.maintenance.turnOff')} disabled={busy} onPress={() => void save(false)} /> : null}
            {!state.active ? <Button size="sm" variant="ghost" title={tr('admin.maintenance.saveOnly')} disabled={busy || !!timeError} onPress={() => void save(false)} /> : null}
            {Platform.OS === 'web' && live ? <Button size="sm" variant="ghost" title={tr('admin.maintenance.preview')} onPress={() => router.push('/maintenance')} /> : null}
          </Row>
        </Stack>
      </Section>
    </Stack>
  );
}
