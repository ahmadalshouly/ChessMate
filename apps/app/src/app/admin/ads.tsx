import {
  AD_PERIODS,
  AD_SPOTS,
  AD_SPOT_KEY,
  AD_SPOT_INFO,
  placementStatus,
  type AdPeriodKey,
  type AdPlacementView,
  type AdSpotId,
  type AdSpotState,
} from '@chessmate/core';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { Segmented } from '@/components/play/Controls';
import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { formatDateTime, formatNumber, useT } from '@/i18n';
import { adImageUrl } from '@/lib/adsApi';
import { PICTURE_MAX_CHARS, pickPicture } from '@/lib/pickLogo';
import { Badge, Button, GlassView, Row, Stack, Switch, Text, TextField, useToast } from '@/ui';

/**
 * The clock the status badges read. A placement goes live and ends on its own,
 * so the console re-reads the time every half minute rather than on a refresh.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

type Form = {
  spot: AdSpotId;
  sponsor: string;
  title: string;
  body: string;
  url: string;
  imageUrl: string;
  /** A newly picked image as a data URL; undefined keeps the stored one. */
  image?: string | null;
  period: AdPeriodKey;
  startsAt: number;
};

function blank(spot: AdSpotId, now: number): Form {
  return { spot, sponsor: '', title: '', body: '', url: '', imageUrl: '', period: 'month', startsAt: now };
}

function formOf(p: AdPlacementView): Form {
  return {
    spot: p.spot,
    sponsor: p.sponsor,
    title: p.title,
    body: p.body ?? '',
    url: p.url ?? '',
    imageUrl: p.imageUrl ?? '',
    period: 'month',
    startsAt: p.startsAt,
  };
}

/**
 * Ad spots: switch each spot on or off, and place a sponsor on it for a
 * period with a title, text, image and link. A spot that is off, or that has
 * no live placement, shows nothing in the app.
 */
export default function AdminAds() {
  const tr = useT();
  const { api } = useAdmin();
  const { data, error, loading, reload } = useLoad(() => api.ads(), [api]);
  const [newFor, setNewFor] = useState<AdSpotId | null>(null);
  const now = useNow();

  const live = (p: AdPlacementView) => placementStatus(p, now) === 'live';
  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader title={tr('admin.nav.ads')} subtitle={tr('admin.ads.subtitle')} />
      <ErrorLine message={error} />

      <Section title={tr('admin.ads.spots')}>
        <Stack gap="md">
          {data?.spots.map((s) => (
            <SpotRow
              key={s.spot}
              s={s}
              placements={data.placements.filter((p) => p.spot === s.spot)}
              now={now}
              onDone={reload}
              onPlace={() => setNewFor(s.spot)}
            />
          ))}
        </Stack>
      </Section>

      {newFor && (
        <Section title={tr('admin.ads.newTitle', { spot: tr(`ads.spot.${AD_SPOT_KEY[newFor]}`) })}>
          <PlacementForm
            initial={blank(newFor, now)}
            onCancel={() => setNewFor(null)}
            onSave={async (f) => {
              await api.createAdPlacement(toBody(f));
              setNewFor(null);
              reload();
            }}
          />
        </Section>
      )}

      <Section title={tr('admin.ads.placements')} padding="none">
        {data && data.placements.length === 0 ? (
          <EmptyState icon="pricetag-outline" title={tr('admin.ads.empty')} body={tr('admin.ads.emptyBody')} />
        ) : (
          <Stack gap="md">
            {data?.placements.map((p) => <PlacementRow key={p.id} p={p} now={now} live={live(p)} onDone={reload} />)}
          </Stack>
        )}
      </Section>
    </AdminPage>
  );
}

/** The form's fields as the server wants them. */
function toBody(f: Form) {
  return {
    spot: f.spot,
    sponsor: f.sponsor,
    title: f.title,
    body: f.body || null,
    url: f.url || null,
    imageUrl: f.imageUrl || null,
    ...(f.image !== undefined ? { image: f.image } : {}),
    startsAt: f.startsAt,
    period: f.period,
  };
}

function SpotRow({ s, placements, now, onDone, onPlace }: { s: AdSpotState; placements: AdPlacementView[]; now: number; onDone: () => void; onPlace: () => void }) {
  const tr = useT();
  const { api } = useAdmin();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(s.note ?? '');
  const [editing, setEditing] = useState(false);
  const liveNow = placements.find((p) => placementStatus(p, now) === 'live');

  const save = async (patch: { enabled?: boolean; note?: string }) => {
    setBusy(true);
    try {
      await api.setAdSpot(s.spot, patch);
      onDone();
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassView radius="lg" padding="lg" flat>
      <Stack gap="sm">
        <Row justify="space-between" gap="md" wrap>
          <Stack gap="xxs" style={{ flexShrink: 1, minWidth: 180 }}>
            <Text variant="subheading">{tr(`ads.spot.${AD_SPOT_KEY[s.spot]}`)}</Text>
            <Text variant="caption" tone="muted">
              {tr(`admin.ads.spotWhere.${AD_SPOT_KEY[s.spot]}`)}
            </Text>
          </Stack>
          <Row gap="sm" align="center">
            <Badge label={tr(`admin.ads.form.${AD_SPOT_INFO[s.spot].form}`)} tone="outline" />
            <Switch value={s.enabled} disabled={busy} onValueChange={(v) => void save({ enabled: v })} accessibilityLabel={tr(`ads.spot.${AD_SPOT_KEY[s.spot]}`)} />
          </Row>
        </Row>
        <Text variant="caption" tone={liveNow ? 'muted' : 'tertiary'}>
          {!s.enabled
            ? tr('admin.ads.spotOff')
            : liveNow
              ? tr('admin.ads.spotLive', { sponsor: liveNow.sponsor, date: formatDateTime(liveNow.endsAt) })
              : tr('admin.ads.spotEmpty')}
        </Text>
        {editing ? (
          <Stack gap="sm">
            <TextField label={tr('admin.ads.spotNote')} value={note} onChangeText={setNote} multiline maxLength={500} />
            <Row gap="sm" wrap>
              <Button size="sm" title={tr('admin.common.save')} loading={busy} onPress={() => void save({ note }).then(() => setEditing(false))} />
              <Button size="sm" variant="ghost" title={tr('common.cancel')} onPress={() => setEditing(false)} />
            </Row>
          </Stack>
        ) : (
          <Row gap="sm" wrap>
            <Button size="sm" variant="secondary" title={tr('admin.ads.place')} onPress={onPlace} />
            <Button size="sm" variant="ghost" title={s.note ? tr('admin.ads.editNote') : tr('admin.ads.addNote')} onPress={() => setEditing(true)} />
            {s.note ? (
              <Text variant="caption" tone="tertiary" style={{ flexShrink: 1 }}>
                {s.note}
              </Text>
            ) : null}
          </Row>
        )}
      </Stack>
    </GlassView>
  );
}

function PlacementRow({ p, now, live, onDone }: { p: AdPlacementView; now: number; live: boolean; onDone: () => void }) {
  const tr = useT();
  const { api } = useAdmin();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = placementStatus(p, now);
  const image = p.imagePath ?? p.imageUrl;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.show({ title: tr('admin.common.done'), tone: 'success' });
      onDone();
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassView radius="lg" padding="lg" flat>
      <Stack gap="sm">
        <Row justify="space-between" gap="sm" wrap>
          <Text variant="subheading" style={{ flexShrink: 1 }}>
            {p.sponsor}
          </Text>
          <Row gap="xs" wrap>
            <Badge label={tr(`ads.spot.${AD_SPOT_KEY[p.spot]}`)} tone="outline" />
            <Badge label={tr(`admin.ads.status.${status}`)} tone={live ? 'solid' : status === 'scheduled' ? 'outline' : 'danger'} />
          </Row>
        </Row>
        <Row gap="md" align="center" wrap>
          {image ? <Image source={{ uri: adImageUrl(image) }} style={{ width: 84, height: 44, borderRadius: 8, backgroundColor: '#fff' }} resizeMode="contain" /> : null}
          <Stack gap="xxs" style={{ flexShrink: 1, minWidth: 160 }}>
            <Text variant="label">{p.title}</Text>
            {p.body ? (
              <Text variant="caption" tone="muted">
                {p.body}
              </Text>
            ) : null}
            {p.url ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {p.url}
              </Text>
            ) : null}
          </Stack>
        </Row>
        <Text variant="caption" tone="tertiary">
          {tr('admin.ads.runs', { from: formatDateTime(p.startsAt), to: formatDateTime(p.endsAt) })}
          {` · ${tr('admin.ads.counts', { views: formatNumber(p.impressions), clicks: formatNumber(p.clicks) })}`}
        </Text>

        {editing ? (
          <PlacementForm
            initial={formOf(p)}
            keepPeriod
            onCancel={() => setEditing(false)}
            onSave={async (f) => {
              await api.saveAdPlacement(p.id, { ...toBody(f), endsAt: p.endsAt, startsAt: f.startsAt });
              setEditing(false);
              onDone();
            }}
          />
        ) : (
          <Row gap="sm" wrap>
            <Button size="sm" variant="secondary" title={tr('admin.ads.edit')} onPress={() => setEditing(true)} />
            <Button
              size="sm"
              variant="ghost"
              loading={busy}
              title={p.stopped ? tr('admin.ads.resume') : tr('admin.ads.stop')}
              onPress={() => void act(() => api.stopAdPlacement(p.id, !p.stopped))}
            />
            {confirmDelete ? (
              <Row gap="sm">
                <Button size="sm" variant="danger" loading={busy} title={tr('admin.ads.deleteConfirm')} onPress={() => void act(() => api.deleteAdPlacement(p.id))} />
                <Button size="sm" variant="ghost" title={tr('common.cancel')} onPress={() => setConfirmDelete(false)} />
              </Row>
            ) : (
              <Button size="sm" variant="ghost" title={tr('admin.ads.delete')} onPress={() => setConfirmDelete(true)} />
            )}
          </Row>
        )}
        {p.createdBy ? (
          <Text variant="caption" tone="tertiary">
            {tr('admin.common.reviewedBy', { name: p.createdBy })}
          </Text>
        ) : null}
      </Stack>
    </GlassView>
  );
}

/**
 * The placement form. `keepPeriod` hides the period buttons when editing, so
 * saving a change cannot silently restart the clock: the dates stay as they
 * were unless staff choose a new period.
 */
function PlacementForm({ initial, keepPeriod, onSave, onCancel }: { initial: Form; keepPeriod?: boolean; onSave: (f: Form) => Promise<void>; onCancel: () => void }) {
  const tr = useT();
  const toast = useToast();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const pick = async () => {
    try {
      const data = await pickPicture();
      if (!data) return;
      if (data.length > PICTURE_MAX_CHARS) return toast.show({ title: tr('admin.ads.imageTooBig'), tone: 'danger' });
      setF((x) => ({ ...x, image: data }));
      setPreview(data);
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await onSave(f);
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="md">
      <Segmented<AdSpotId> size="sm" value={f.spot} onChange={set('spot')} options={AD_SPOTS.map((s) => ({ value: s, label: tr(`ads.spot.${AD_SPOT_KEY[s]}`) }))} />
      <TextField label={tr('admin.ads.sponsor')} value={f.sponsor} onChangeText={set('sponsor')} maxLength={60} />
      <TextField label={tr('admin.ads.title')} value={f.title} onChangeText={set('title')} maxLength={60} placeholder={tr('admin.ads.titleHint')} />
      <TextField label={tr('admin.ads.body')} value={f.body} onChangeText={set('body')} multiline maxLength={160} />
      <TextField label={tr('admin.ads.url')} value={f.url} onChangeText={set('url')} autoCapitalize="none" placeholder="https://" maxLength={500} />
      <Row gap="md" align="center" wrap>
        <Button size="sm" variant="secondary" title={tr('admin.ads.pickImage')} onPress={() => void pick()} />
        {preview ? <Image source={{ uri: preview }} style={{ width: 84, height: 44, borderRadius: 8, backgroundColor: '#fff' }} resizeMode="contain" /> : null}
        {f.image !== undefined ? <Button size="sm" variant="ghost" title={tr('admin.ads.clearImage')} onPress={() => (setF((x) => ({ ...x, image: null })), setPreview(null))} /> : null}
      </Row>
      <TextField label={tr('admin.ads.imageUrl')} value={f.imageUrl} onChangeText={set('imageUrl')} autoCapitalize="none" placeholder="https://" maxLength={500} />
      {!keepPeriod && (
        <Stack gap="xs">
          <Text variant="overline" tone="muted">
            {tr('admin.ads.period')}
          </Text>
          <Segmented<AdPeriodKey> size="sm" value={f.period} onChange={set('period')} options={AD_PERIODS.map((p) => ({ value: p.key, label: tr(`admin.ads.periodName.${p.key}`) }))} />
          <Text variant="caption" tone="tertiary">
            {tr('admin.ads.until', { date: formatDateTime(f.startsAt + (AD_PERIODS.find((p) => p.key === f.period)?.days ?? 30) * 86_400_000) })}
          </Text>
        </Stack>
      )}
      <Row gap="sm" wrap>
        <Button size="sm" title={tr('admin.common.save')} loading={busy} disabled={f.sponsor.trim().length < 2 || f.title.trim().length < 2} onPress={() => void save()} />
        <Button size="sm" variant="ghost" title={tr('common.cancel')} onPress={onCancel} />
      </Row>
      <View />
    </Stack>
  );
}
