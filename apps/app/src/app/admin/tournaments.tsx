import { formatTimeControl, type TournamentInput, type TournamentPrize, type TournamentSummary } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { tournamentClock } from '@/features/tournaments/format';
import { formatDateTime, useT } from '@/i18n';
import { Badge, Button, GlassView, Modal, Row, Stack, Switch, Text, TextField, useAppTheme, useToast } from '@/ui';

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const localTime = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** "2026-11-20" + "18:30" in the staff member's own time zone. */
const parseLocal = (date: string, time: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m || !t) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2])).getTime();
};

interface Form {
  name: string;
  description: string;
  minutes: string;
  increment: string;
  rated: boolean;
  date: string;
  time: string;
  duration: string;
  maxPlayers: string;
  prizePool: string;
  prizes: { place: string; prize: string }[];
}

function emptyForm(): Form {
  const start = Math.ceil((Date.now() + 30 * 60_000) / 3_600_000) * 3_600_000;
  return { name: '', description: '', minutes: '3', increment: '2', rated: true, date: localDate(start), time: localTime(start), duration: '60', maxPlayers: '', prizePool: '', prizes: [{ place: '1', prize: '' }] };
}

function formOf(t: TournamentSummary): Form {
  return {
    name: t.name,
    description: t.description ?? '',
    minutes: String(t.timeControl.initialMs / 60_000),
    increment: String(t.timeControl.incrementMs / 1000),
    rated: t.rated,
    date: localDate(t.startsAt),
    time: localTime(t.startsAt),
    duration: String(t.durationMinutes),
    maxPlayers: t.maxPlayers ? String(t.maxPlayers) : '',
    prizePool: t.prizePool ?? '',
    prizes: t.prizes.length ? t.prizes.map((p) => ({ place: String(p.place), prize: p.prize })) : [{ place: '1', prize: '' }],
  };
}

function inputOf(f: Form): TournamentInput {
  return {
    name: f.name,
    description: f.description || null,
    timeControl: { initialMs: Math.round(Number(f.minutes) * 60_000), incrementMs: Math.round(Number(f.increment) * 1000) },
    rated: f.rated,
    startsAt: parseLocal(f.date, f.time),
    durationMinutes: Number(f.duration),
    maxPlayers: f.maxPlayers.trim() ? Number(f.maxPlayers) : null,
    prizePool: f.prizePool || null,
    prizes: f.prizes.filter((p) => p.prize.trim()).map((p): TournamentPrize => ({ place: Number(p.place), prize: p.prize })),
  };
}

/** Staff: create, schedule, edit, start and cancel arena tournaments, with a prize pool and prizes per place. */
export default function AdminTournaments() {
  const tr = useT();
  const { api } = useAdmin();
  const { data, error, loading, reload } = useLoad(() => api.tournaments(), [api]);
  const [editing, setEditing] = useState<{ id: string | null; status: TournamentSummary['status'] | null; form: Form } | null>(null);
  const list = data ?? [];
  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader
        title={tr('admin.nav.tournaments')}
        subtitle={tr('admin.tournaments.subtitle')}
        right={<Button title={tr('admin.tournaments.create')} size="sm" onPress={() => setEditing({ id: null, status: null, form: emptyForm() })} />}
      />
      <ErrorLine message={error} />
      {data && list.length === 0 && <EmptyState icon="trophy-outline" title={tr('admin.tournaments.empty')} body={tr('admin.tournaments.emptyBody')} />}
      <Stack gap="md">
        {list.map((t) => (
          <TournamentRow key={t.id} t={t} onEdit={() => setEditing({ id: t.id, status: t.status, form: formOf(t) })} onDone={reload} />
        ))}
      </Stack>
      {editing && (
        <TournamentForm
          initial={editing.form}
          id={editing.id}
          started={editing.status === 'running' || editing.status === 'finished'}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </AdminPage>
  );
}

function TournamentRow({ t, onEdit, onDone }: { t: TournamentSummary; onEdit: () => void; onDone: () => void }) {
  const tr = useT();
  const { api } = useAdmin();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (key: string, fn: () => Promise<unknown>) => async () => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      toast.show({ title: tr('admin.common.done'), tone: 'success' });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('admin.common.failed'));
    } finally {
      setBusy(null);
    }
  };
  const tone = t.status === 'running' ? 'live' : t.status === 'scheduled' ? 'solid' : t.status === 'cancelled' ? 'danger' : 'neutral';
  return (
    <GlassView radius="lg" padding="lg" flat>
      <Stack gap="sm">
        <Row justify="space-between" wrap gap="sm">
          <Stack gap="xxs" style={{ flex: 1, minWidth: 220 }}>
            <Row gap="sm" wrap>
              <Text variant="subheading">{t.name}</Text>
              <Badge label={tr(`admin.tournaments.status.${t.status}`)} tone={tone} />
            </Row>
            <Text variant="caption" tone="muted">
              {formatTimeControl(t.timeControl)} · {t.rated ? tr('play.rated') : tr('play.casual')} · {formatDateTime(t.startsAt)} · {tr('tournaments.minutes', { count: t.durationMinutes })} ·{' '}
              {tr('tournaments.players', { count: t.players, n: t.players })}
            </Text>
            <Text variant="caption" tone="muted">
              {tournamentClock(t)}
              {t.prizePool ? ` · ${t.prizePool}` : ''}
              {t.prizes.length ? ` · ${tr('admin.tournaments.prizeCount', { count: t.prizes.length })}` : ''}
            </Text>
          </Stack>
          <Row gap="sm" wrap>
            <Button size="sm" variant="ghost" title={tr('admin.tournaments.view')} onPress={() => router.push({ pathname: '/tournaments/[id]', params: { id: t.id } })} />
            {t.status !== 'cancelled' && <Button size="sm" variant="secondary" title={tr('admin.tournaments.edit')} onPress={onEdit} />}
            {t.status === 'scheduled' && <Button size="sm" variant="secondary" title={tr('admin.tournaments.startNow')} loading={busy === 'start'} onPress={run('start', () => api.startTournament(t.id))} />}
            {(t.status === 'scheduled' || t.status === 'running') && (
              <Button size="sm" variant="danger" title={tr('admin.tournaments.cancel')} loading={busy === 'cancel'} onPress={run('cancel', () => api.cancelTournament(t.id, ''))} />
            )}
          </Row>
        </Row>
        <ErrorLine message={error} />
      </Stack>
    </GlassView>
  );
}

function TournamentForm({ initial, id, started, onClose, onSaved }: { initial: Form; id: string | null; started: boolean; onClose: () => void; onSaved: () => void }) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  const { api } = useAdmin();
  const toast = useToast();
  const [f, setF] = useState<Form>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const setPrize = (i: number, patch: Partial<Form['prizes'][number]>) => setF((x) => ({ ...x, prizes: x.prizes.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const input = inputOf(f);
      if (id) await api.updateTournament(id, input);
      else await api.createTournament(input);
      toast.show({ title: id ? tr('admin.tournaments.saved') : tr('admin.tournaments.created'), message: f.name, tone: 'success' });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('admin.common.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible
      onClose={onClose}
      presentation="sheet"
      title={id ? tr('admin.tournaments.editTitle') : tr('admin.tournaments.createTitle')}
      actions={
        <>
          <Button variant="ghost" title={tr('admin.common.cancel')} onPress={onClose} />
          <Button title={id ? tr('admin.common.save') : tr('admin.tournaments.create')} loading={busy} disabled={!f.name.trim()} onPress={() => void save()} />
        </>
      }>
      <Stack gap="md">
        <TextField label={tr('admin.tournaments.name')} value={f.name} onChangeText={(v) => set('name', v)} maxLength={60} />
        <TextField label={tr('admin.tournaments.description')} value={f.description} onChangeText={(v) => set('description', v)} multiline maxLength={600} />
        {started && <Text variant="caption" tone="muted">{tr('admin.tournaments.lockedHint')}</Text>}
        <Section title={tr('admin.tournaments.schedule')} padding="none">
          <Stack gap="md">
            <Row gap="sm">
              <View style={{ flex: 1 }}>
                <TextField label={tr('admin.tournaments.minutes')} value={f.minutes} onChangeText={(v) => set('minutes', v)} keyboardType="decimal-pad" editable={!started} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label={tr('admin.tournaments.increment')} value={f.increment} onChangeText={(v) => set('increment', v)} keyboardType="number-pad" editable={!started} />
              </View>
            </Row>
            <Row gap="sm">
              <View style={{ flex: 1 }}>
                <TextField label={tr('admin.tournaments.date')} value={f.date} onChangeText={(v) => set('date', v)} placeholder="2026-12-01" editable={!started} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label={tr('admin.tournaments.time')} value={f.time} onChangeText={(v) => set('time', v)} placeholder="18:00" editable={!started} />
              </View>
            </Row>
            <Row gap="sm">
              <View style={{ flex: 1 }}>
                <TextField label={tr('admin.tournaments.duration')} value={f.duration} onChangeText={(v) => set('duration', v)} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label={tr('admin.tournaments.maxPlayers')} value={f.maxPlayers} onChangeText={(v) => set('maxPlayers', v)} keyboardType="number-pad" placeholder="—" />
              </View>
            </Row>
            <Row justify="space-between">
              <Text variant="label">{tr('play.rated')}</Text>
              <Switch value={f.rated} onValueChange={(v) => set('rated', v)} disabled={started} />
            </Row>
          </Stack>
        </Section>
        <Section title={tr('tournaments.prizes')} padding="none">
          <Stack gap="md">
            <TextField label={tr('admin.tournaments.prizePool')} value={f.prizePool} onChangeText={(v) => set('prizePool', v)} placeholder={tr('admin.tournaments.prizePoolHint')} maxLength={80} />
            {f.prizes.map((p, i) => (
              <Row key={i} gap="sm" align="flex-end">
                <View style={{ width: 72 }}>
                  <TextField label={tr('admin.tournaments.placeLabel')} value={p.place} onChangeText={(v) => setPrize(i, { place: v })} keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label={tr('admin.tournaments.prize')} value={p.prize} onChangeText={(v) => setPrize(i, { prize: v })} maxLength={80} />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr('admin.tournaments.removePrize')}
                  onPress={() => setF((x) => ({ ...x, prizes: x.prizes.filter((_, j) => j !== i) }))}
                  style={styles.remove}>
                  <Ionicons name="close-circle-outline" size={22} color={c.muted} />
                </Pressable>
              </Row>
            ))}
            {f.prizes.length < 10 && (
              <Button
                variant="secondary"
                size="sm"
                title={tr('admin.tournaments.addPrize')}
                onPress={() => setF((x) => ({ ...x, prizes: [...x.prizes, { place: String(x.prizes.length + 1), prize: '' }] }))}
              />
            )}
          </Stack>
        </Section>
        <ErrorLine message={error} />
      </Stack>
    </Modal>
  );
}

const styles = StyleSheet.create({
  remove: { paddingBottom: 12 },
});
