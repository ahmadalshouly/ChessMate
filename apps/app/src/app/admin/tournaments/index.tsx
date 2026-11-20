import { DEFAULT_TOURNAMENT_SETTINGS, TOURNAMENT_CURRENCIES, formatMoney, type TournamentSettings, formatTimeControl, type TournamentCurrency, type TournamentInput, type TournamentPrize, type TournamentSummary } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Segmented } from '@/components/play/Controls';
import { logoUrl } from '@/lib/tournamentsApi';

import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { formatLabel, settingsOf, tournamentClock } from '@/features/tournaments/format';
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
  /** Entry fee in whole currency units as typed ("5", "2.50"); empty = free. */
  fee: string;
  currency: TournamentCurrency;
  minRating: string;
  maxRating: string;
  minRatedGames: string;
  lateJoin: boolean;
  rules: string;
  sponsorName: string;
  sponsorUrl: string;
  /** New logo as a data URL; null removes it; undefined keeps the current one. */
  logo: string | null | undefined;
  /** Current logo on the server, for the preview. */
  logoPath: string | null;
  /** Format, end mode and arena scoring. */
  settings: TournamentSettings;
  /** Swiss rounds as typed. */
  rounds: string;
}

/** Reads a picked image file as a data URL (web and phones). */
async function fileAsDataUrl(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.readAsDataURL(blob);
  });
}

/** Logos are shown small; on the web, big images are scaled down to this many pixels on the long side. */
const LOGO_MAX_PX = 512;

/**
 * Web only: scales a large logo down (keeping transparency) so it fits the upload
 * limit. Phones send the picked file as it is.
 */
async function shrinkLogo(dataUrl: string): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return dataUrl;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not read the image'));
    el.src = dataUrl;
  });
  const scale = Math.min(1, LOGO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && dataUrl.length <= 200_000) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', 0.9);
  const out = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  return out.length < dataUrl.length ? out : dataUrl;
}

function emptyForm(): Form {
  const start = Math.ceil((Date.now() + 30 * 60_000) / 3_600_000) * 3_600_000;
  return {
    name: '',
    description: '',
    minutes: '3',
    increment: '2',
    rated: true,
    date: localDate(start),
    time: localTime(start),
    duration: '60',
    maxPlayers: '',
    prizePool: '',
    prizes: [{ place: '1', prize: '' }],
    fee: '',
    currency: 'eur',
    minRating: '',
    maxRating: '',
    minRatedGames: '0',
    lateJoin: true,
    rules: '',
    sponsorName: '',
    sponsorUrl: '',
    logo: undefined,
    logoPath: null,
    settings: { ...DEFAULT_TOURNAMENT_SETTINGS },
    rounds: String(DEFAULT_TOURNAMENT_SETTINGS.rounds),
  };
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
    fee: t.entryFeeCents ? String(t.entryFeeCents / 100) : '',
    currency: t.currency,
    minRating: t.minRating !== null ? String(t.minRating) : '',
    maxRating: t.maxRating !== null ? String(t.maxRating) : '',
    minRatedGames: String(t.minRatedGames),
    lateJoin: t.lateJoin,
    rules: t.rules ?? '',
    sponsorName: t.sponsor?.name ?? '',
    sponsorUrl: t.sponsor?.url ?? '',
    logo: undefined,
    logoPath: t.sponsor?.logoPath ?? null,
    settings: settingsOf(t),
    rounds: String(settingsOf(t).rounds),
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
    entryFeeCents: f.fee.trim() ? Math.round(Number(f.fee.replace(',', '.')) * 100) : 0,
    currency: f.currency,
    minRating: f.minRating.trim() ? Number(f.minRating) : null,
    maxRating: f.maxRating.trim() ? Number(f.maxRating) : null,
    minRatedGames: Number(f.minRatedGames) || 0,
    lateJoin: f.lateJoin,
    rules: f.rules.trim() || null,
    sponsorName: f.sponsorName.trim() || null,
    sponsorUrl: f.sponsorUrl.trim() || null,
    ...(f.logo !== undefined ? { sponsorLogo: f.logo } : {}),
    settings: { ...f.settings, rounds: f.settings.format === 'swiss' ? Number(f.rounds) : f.settings.rounds },
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
              {formatLabel(t)} · {formatTimeControl(t.timeControl)} · {t.rated ? tr('play.rated') : tr('play.casual')} · {formatDateTime(t.startsAt)} · {tr('tournaments.minutes', { count: t.durationMinutes })} ·{' '}
              {tr('tournaments.players', { count: t.players, n: t.players })}
            </Text>
            <Text variant="caption" tone="muted">
              {tournamentClock(t)}
              {t.entryFeeCents ? ` · ${formatMoney(t.entryFeeCents, t.currency)}` : ` · ${tr('tournaments.free')}`}
              {t.sponsor ? ` · ${t.sponsor.name}` : ''}
              {t.prizePool ? ` · ${t.prizePool}` : ''}
              {t.prizes.length ? ` · ${tr('admin.tournaments.prizeCount', { count: t.prizes.length })}` : ''}
            </Text>
          </Stack>
          <Row gap="sm" wrap>
            <Button size="sm" variant="secondary" title={tr('admin.tournaments.monitor')} onPress={() => router.push({ pathname: '/admin/tournaments/[id]', params: { id: t.id } })} />
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
  const setRule = <K extends keyof TournamentSettings>(k: K, v: TournamentSettings[K]) => setF((x) => ({ ...x, settings: { ...x.settings, [k]: v } }));
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
        <Section title={tr('admin.tournaments.format')} padding="none">
          <Stack gap="md">
            <Segmented
              value={f.settings.format}
              onChange={(v) => setRule('format', v)}
              options={[
                { value: 'arena', label: tr('admin.tournaments.formatArena'), disabled: started },
                { value: 'swiss', label: tr('admin.tournaments.formatSwiss'), disabled: started },
              ]}
            />
            <Text variant="caption" tone="muted">
              {f.settings.format === 'swiss' ? tr('admin.tournaments.swissHint') : tr('admin.tournaments.arenaHint')}
            </Text>
            {f.settings.format === 'swiss' && (
              <Stack gap="xs">
                <TextField label={tr('admin.tournaments.rounds')} value={f.rounds} onChangeText={(v) => set('rounds', v)} keyboardType="number-pad" editable={!started} />
                <Text variant="caption" tone="muted">
                  {tr('admin.tournaments.roundsHint')}
                </Text>
              </Stack>
            )}
            <Text variant="label">{tr('admin.tournaments.endTitle')}</Text>
            <Segmented
              value={f.settings.endMode}
              onChange={(v) => setRule('endMode', v)}
              options={[
                { value: 'wait', label: tr('admin.tournaments.endWait'), disabled: started },
                { value: 'timer', label: tr('admin.tournaments.endTimer'), disabled: started },
              ]}
            />
            <Text variant="caption" tone="muted">
              {f.settings.endMode === 'wait' ? tr('admin.tournaments.endWaitHint') : tr('admin.tournaments.endTimerHint')}
            </Text>
            {f.settings.format === 'arena' && (
              <>
                <Text variant="label">{tr('admin.tournaments.scoring')}</Text>
                {(['winStreak', 'drawStreak', 'lossStreak', 'frenzy'] as const).map((k) => (
                  <Row key={k} justify="space-between" gap="md">
                    <View style={{ flex: 1, gap: 2 }}>
                      <Row gap="xs">
                        {k === 'frenzy' && <Ionicons name="flash" size={14} color={c.warning} />}
                        <Text variant="body">{tr(`admin.tournaments.${k}`)}</Text>
                      </Row>
                      <Text variant="caption" tone="muted">
                        {tr(`admin.tournaments.${k}Hint`)}
                      </Text>
                    </View>
                    <Switch value={f.settings[k]} onValueChange={(v) => setRule(k, v)} disabled={started} />
                  </Row>
                ))}
              </>
            )}
          </Stack>
        </Section>
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
        <Section title={tr('admin.tournaments.entry')} padding="none">
          <Stack gap="md">
            <Row gap="sm" align="flex-end">
              <View style={{ flex: 1 }}>
                <TextField label={tr('admin.tournaments.fee')} value={f.fee} onChangeText={(v) => set('fee', v)} keyboardType="decimal-pad" placeholder={tr('tournaments.free')} editable={!started} />
              </View>
              <Segmented<TournamentCurrency>
                size="sm"
                value={f.currency}
                onChange={(v) => !started && set('currency', v)}
                options={TOURNAMENT_CURRENCIES.map((cur) => ({ value: cur, label: cur.toUpperCase() }))}
              />
            </Row>
            <Text variant="caption" tone="muted">
              {tr('admin.tournaments.feeHint')}
            </Text>
            <Row gap="sm">
              <View style={{ flex: 1 }}>
                <TextField label={tr('admin.tournaments.minRating')} value={f.minRating} onChangeText={(v) => set('minRating', v)} keyboardType="number-pad" placeholder="—" editable={!started} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label={tr('admin.tournaments.maxRating')} value={f.maxRating} onChangeText={(v) => set('maxRating', v)} keyboardType="number-pad" placeholder="—" editable={!started} />
              </View>
            </Row>
            <TextField label={tr('admin.tournaments.minGames')} value={f.minRatedGames} onChangeText={(v) => set('minRatedGames', v)} keyboardType="number-pad" editable={!started} />
            <Row justify="space-between">
              <Text variant="label">{tr('admin.tournaments.lateJoin')}</Text>
              <Switch value={f.lateJoin} onValueChange={(v) => set('lateJoin', v)} />
            </Row>
            <TextField label={tr('admin.tournaments.rules')} value={f.rules} onChangeText={(v) => set('rules', v)} multiline maxLength={2000} placeholder={tr('admin.tournaments.rulesHint')} />
          </Stack>
        </Section>
        <Section title={tr('admin.tournaments.sponsor')} padding="none">
          <Stack gap="md">
            <TextField label={tr('admin.tournaments.sponsorName')} value={f.sponsorName} onChangeText={(v) => set('sponsorName', v)} maxLength={60} />
            <TextField label={tr('admin.tournaments.sponsorUrl')} value={f.sponsorUrl} onChangeText={(v) => set('sponsorUrl', v)} autoCapitalize="none" placeholder="https://" maxLength={200} />
            <Row gap="md" align="center" wrap>
              {(f.logo || (f.logo === undefined && f.logoPath)) && (
                <View style={[styles.logoBox, { borderColor: c.border }]}>
                  <Image source={{ uri: f.logo ? f.logo : logoUrl(f.logoPath!) }} style={styles.logo} resizeMode="contain" />
                </View>
              )}
              <Button
                size="sm"
                variant="secondary"
                title={f.logo || (f.logo === undefined && f.logoPath) ? tr('admin.tournaments.replaceLogo') : tr('admin.tournaments.uploadLogo')}
                onPress={async () => {
                  const r = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true });
                  const asset = r.canceled ? null : r.assets?.[0];
                  if (!asset) return;
                  try {
                    const url = await shrinkLogo(await fileAsDataUrl(asset.uri));
                    if (url.length > 400_000) return setError(tr('admin.tournaments.logoTooBig'));
                    set('logo', url);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}
              />
              {(f.logo || (f.logo === undefined && f.logoPath)) && <Button size="sm" variant="ghost" title={tr('admin.tournaments.removeLogo')} onPress={() => set('logo', null)} />}
            </Row>
            <Text variant="caption" tone="muted">
              {tr('admin.tournaments.logoHint')}
            </Text>
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
  logoBox: { backgroundColor: '#fff', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 6 },
  logo: { width: 120, height: 40 },
});
