import Ionicons from '@expo/vector-icons/Ionicons';
import {
  CAMPAIGN_DAILY_CAP,
  CAMPAIGN_PLATFORMS,
  DEFAULT_TRIGGER,
  EMPTY_AUDIENCE,
  TRIGGER_EVENTS,
  type Campaign,
  type CampaignAudience,
  type CampaignInput,
  type CampaignKind,
  type CampaignPlatform,
  type CampaignTrigger,
  type TriggerEvent,
} from '@chessmate/core';
import { Stack as RouterStack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Segmented } from '@/components/play/Controls';
import { useAdmin } from '@/features/admin/AdminContext';
import { STATUS_TONE } from '@/features/admin/campaigns';
import { AdminPage, ErrorLine, PageHeader, Section } from '@/features/admin/ui';
import { useT, type TKey } from '@/i18n';
import { Badge, Button, Row, Stack, Switch, Text, TextField, useAppTheme, useToast } from '@/ui';
import { goBack } from '@/lib/goBack';


const LINKS: { url: string | null; label: TKey }[] = [
  { url: '/', label: 'pushAdmin.links.home' },
  { url: '/play', label: 'pushAdmin.links.play' },
  { url: '/puzzles', label: 'pushAdmin.links.puzzles' },
  { url: '/learn', label: 'pushAdmin.links.learn' },
  { url: '/tournaments', label: 'pushAdmin.links.tournaments' },
  { url: '/watch', label: 'pushAdmin.links.watch' },
  { url: '/friends', label: 'pushAdmin.links.friends' },
  { url: '/notifications', label: 'pushAdmin.links.notifications' },
  { url: null, label: 'pushAdmin.links.none' },
];

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
const numOrNull = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));
const str = (n: number | null) => (n === null ? '' : String(n));

type Who = 'everyone' | 'segment' | 'picked';

interface Form {
  name: string;
  title: string;
  body: string;
  url: string | null;
  customUrl: string;
  push: boolean;
  inbox: boolean;
  kind: CampaignKind;
  date: string;
  time: string;
  trigger: CampaignTrigger;
  who: Who;
  usernames: string;
  platform: CampaignPlatform;
  inactiveDays: string;
  activeWithinDays: string;
  joinedWithinDays: string;
  minGames: string;
  maxGames: string;
  countries: string;
}

function blank(kind: CampaignKind): Form {
  const soon = Date.now() + 60 * 60_000;
  return {
    name: '',
    title: '',
    body: '',
    url: '/play',
    customUrl: '',
    push: true,
    inbox: true,
    kind,
    date: localDate(soon),
    time: localTime(soon),
    trigger: { ...DEFAULT_TRIGGER },
    who: 'everyone',
    usernames: '',
    platform: 'any',
    inactiveDays: '',
    activeWithinDays: '',
    joinedWithinDays: '',
    minGames: '',
    maxGames: '',
    countries: '',
  };
}

function fromCampaign(c: Campaign, copy: boolean): Form {
  const a = c.audience;
  const preset = LINKS.some((l) => l.url === c.message.url);
  const segment = a.platform !== 'any' || a.inactiveDays || a.activeWithinDays || a.joinedWithinDays || a.minGames !== null || a.maxGames !== null || a.countries.length;
  return {
    ...blank(c.kind),
    name: copy ? '' : c.name,
    title: c.message.title,
    body: c.message.body,
    url: preset ? c.message.url : 'custom',
    customUrl: preset ? '' : (c.message.url ?? ''),
    push: c.message.push,
    inbox: c.message.inbox,
    kind: c.kind,
    ...(c.scheduleAt && !copy ? { date: localDate(c.scheduleAt), time: localTime(c.scheduleAt) } : null),
    trigger: c.trigger ?? { ...DEFAULT_TRIGGER },
    who: a.usernames.length ? 'picked' : segment ? 'segment' : 'everyone',
    usernames: a.usernames.join(', '),
    platform: a.platform,
    inactiveDays: str(a.inactiveDays),
    activeWithinDays: str(a.activeWithinDays),
    joinedWithinDays: str(a.joinedWithinDays),
    minGames: str(a.minGames),
    maxGames: str(a.maxGames),
    countries: a.countries.join(', '),
  };
}

function audienceOf(f: Form): CampaignAudience {
  if (f.who === 'everyone') return { ...EMPTY_AUDIENCE };
  if (f.who === 'picked') return { ...EMPTY_AUDIENCE, usernames: f.usernames.split(/[\s,]+/).filter(Boolean) };
  return {
    usernames: [],
    platform: f.platform,
    inactiveDays: numOrNull(f.inactiveDays),
    activeWithinDays: numOrNull(f.activeWithinDays),
    joinedWithinDays: numOrNull(f.joinedWithinDays),
    minGames: numOrNull(f.minGames),
    maxGames: numOrNull(f.maxGames),
    countries: f.countries.split(/[\s,]+/).filter(Boolean),
  };
}

function inputOf(f: Form): CampaignInput {
  return {
    name: f.name,
    kind: f.kind,
    message: { title: f.title, body: f.body, url: f.url === 'custom' ? f.customUrl.trim() || null : f.url, push: f.push, inbox: f.inbox },
    audience: audienceOf(f),
    scheduleAt: f.kind === 'scheduled' ? parseLocal(f.date, f.time) : null,
    trigger: f.kind === 'trigger' ? f.trigger : null,
  };
}

/** Write a notification, pick when it goes out and who gets it. `id` is "new" for a new one. */
export default function CampaignEditor() {
  const tr = useT();
  const t = useAppTheme();
  const toast = useToast();
  const { api, me } = useAdmin();
  const params = useLocalSearchParams<{ id: string; kind?: string; from?: string }>();
  const isNew = params.id === 'new';
  const [form, setForm] = useState<Form>(() => blank(params.kind === 'trigger' ? 'trigger' : 'instant'));
  const [existing, setExisting] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reach, setReach] = useState<{ count: number; sample: string[]; withPush: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setConfirm(false);
    // The reach shown is for the audience as it was; any change can move it.
    setReach(null);
  };
  const setTrigger = (patch: Partial<CampaignTrigger>) => set({ trigger: { ...form.trigger, ...patch } });

  useEffect(() => {
    const source = isNew ? params.from : params.id;
    if (!source) return;
    api
      .campaign(source)
      .then((c) => {
        if (!isNew) setExisting(c);
        setForm(fromCampaign(c, isNew));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [api, isNew, params.from, params.id]);

  const checkReach = async () => {
    setBusy('reach');
    try {
      setReach(await api.campaignPreview(audienceOf(form)));
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('admin.common.failed'));
    } finally {
      setBusy(null);
    }
  };

  const save = async (go: boolean) => {
    // A one-off send to many players cannot be taken back: show the reach and ask once.
    if (go && form.kind === 'instant' && !confirm) {
      setBusy('reach');
      try {
        setReach(await api.campaignPreview(audienceOf(form)));
        setConfirm(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : tr('admin.common.failed'));
      } finally {
        setBusy(null);
      }
      return;
    }
    setBusy(go ? 'go' : 'save');
    setError(null);
    try {
      const input = inputOf(form);
      const c = isNew ? await api.createCampaign(input, go) : await api.saveCampaign(params.id, input, go);
      toast.show({
        title: tr(!go ? 'pushAdmin.form.saved' : c.kind === 'trigger' ? 'pushAdmin.form.triggerOn' : c.kind === 'scheduled' ? 'pushAdmin.form.scheduled' : 'pushAdmin.form.sent'),
        tone: 'success',
      });
      goBack('/admin/notifications');
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('admin.common.failed'));
      setConfirm(false);
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setError(null);
    try {
      const r = await api.campaignTest(inputOf(form).message);
      toast.show({ title: r.devices ? tr('pushAdmin.form.testSent', { count: r.devices }) : tr('pushAdmin.form.testNoDevice'), tone: 'success' });
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('admin.common.failed'));
    } finally {
      setBusy(null);
    }
  };

  const locked = existing && !['draft', 'scheduled', 'active', 'paused'].includes(existing.status);
  const sample = (s: string) => s.replace(/\{username\}/g, me?.username ?? 'magnus');
  const goTitle = form.kind === 'trigger' ? 'pushAdmin.form.turnOn' : form.kind === 'scheduled' ? 'pushAdmin.form.schedule' : 'pushAdmin.form.sendNow';
  const triggerOn = existing?.status === 'active';

  return (
    <AdminPage>
      <RouterStack.Screen options={{ title: tr('pushAdmin.nav'), headerShown: true }} />
      <PageHeader
        title={isNew ? tr('pushAdmin.form.newTitle') : tr('pushAdmin.form.editTitle')}
        subtitle={existing?.name}
        right={existing ? <Badge label={tr(`pushAdmin.status.${existing.status}`)} tone={STATUS_TONE[existing.status]} /> : undefined}
      />

      <Section title={tr('pushAdmin.form.step.message')} index={1}>
        <Stack gap="md">
          <TextField label={tr('pushAdmin.form.title')} value={form.title} onChangeText={(v) => set({ title: v })} maxLength={120} editable={!locked} />
          <TextField label={tr('pushAdmin.form.body')} value={form.body} onChangeText={(v) => set({ body: v })} maxLength={400} multiline helper={tr('pushAdmin.form.personalize')} editable={!locked} />
          <View style={{ gap: 6 }}>
            <Text variant="label" tone="muted">
              {tr('pushAdmin.form.link')}
            </Text>
            <Row gap="xs" wrap>
              {[...LINKS, { url: 'custom', label: 'pushAdmin.form.linkCustom' as TKey }].map((l) => (
                <Button key={String(l.url)} size="sm" variant={form.url === l.url ? 'primary' : 'secondary'} title={tr(l.label)} onPress={() => set({ url: l.url })} />
              ))}
            </Row>
            {form.url === 'custom' && <TextField value={form.customUrl} onChangeText={(v) => set({ customUrl: v })} placeholder="/tournaments" helper={tr('pushAdmin.form.linkHelp')} autoCapitalize="none" />}
          </View>
          <Row justify="space-between">
            <Text>{tr('pushAdmin.form.push')}</Text>
            <Switch value={form.push} onValueChange={(v) => set({ push: v })} />
          </Row>
          <Row justify="space-between">
            <Text>{tr('pushAdmin.form.inbox')}</Text>
            <Switch value={form.inbox} onValueChange={(v) => set({ inbox: v })} />
          </Row>
          <View style={{ gap: 6 }}>
            <Text variant="label" tone="muted">
              {tr('pushAdmin.form.preview')}
            </Text>
            <View style={[styles.lock, { backgroundColor: t.colors.surfaceSunken, borderRadius: t.radii.lg, borderColor: t.colors.border }]}>
              <View style={[styles.appIcon, { backgroundColor: t.colors.text }]}>
                <Ionicons name="trophy" size={14} color={t.colors.bg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>
                  {sample(form.title) || tr('pushAdmin.form.title')}
                </Text>
                <Text tone="muted" numberOfLines={4}>
                  {sample(form.body) || tr('pushAdmin.form.body')}
                </Text>
              </View>
            </View>
          </View>
          <Row>
            <Button size="sm" variant="secondary" title={tr('pushAdmin.form.sendTest')} loading={busy === 'test'} disabled={!form.title.trim() || !form.body.trim()} onPress={() => void test()} />
          </Row>
        </Stack>
      </Section>

      <Section title={tr('pushAdmin.form.step.delivery')} index={2}>
        <Stack gap="md">
          {(isNew || existing?.kind !== 'trigger') && (
            <Segmented<CampaignKind>
              options={(isNew ? (['instant', 'scheduled', 'trigger'] as CampaignKind[]) : (['instant', 'scheduled'] as CampaignKind[])).map((k) => ({ value: k, label: tr(`pushAdmin.kind.${k}`) }))}
              value={form.kind}
              onChange={(k) => set({ kind: k })}
            />
          )}
          {form.kind === 'scheduled' && (
            <Row gap="sm" wrap align="flex-start">
              <TextField containerStyle={{ flex: 1, minWidth: 160 }} label={tr('pushAdmin.form.date')} value={form.date} onChangeText={(v) => set({ date: v })} />
              <TextField containerStyle={{ flex: 1, minWidth: 120 }} label={tr('pushAdmin.form.time')} value={form.time} onChangeText={(v) => set({ time: v })} />
            </Row>
          )}
          {form.kind === 'trigger' && (
            <Stack gap="md">
              <Text variant="label" tone="muted">
                {tr('pushAdmin.form.event')}
              </Text>
              <Stack gap="xs">
                {TRIGGER_EVENTS.map((e: TriggerEvent) => (
                  <Button key={e} size="sm" variant={form.trigger.event === e ? 'primary' : 'secondary'} title={tr(`pushAdmin.event.${e}`)} onPress={() => setTrigger({ event: e })} />
                ))}
              </Stack>
              <Text variant="caption" tone="muted">
                {tr(`pushAdmin.eventHelp.${form.trigger.event}`)}
              </Text>
              <Row gap="sm" wrap align="flex-start">
                {form.trigger.event === 'inactive' ? (
                  <NumField label={tr('pushAdmin.form.days')} value={form.trigger.days} onChange={(n) => setTrigger({ days: n })} />
                ) : (
                  <NumField label={tr('pushAdmin.form.delay')} value={form.trigger.delayMinutes} onChange={(n) => setTrigger({ delayMinutes: n })} />
                )}
                <NumField label={tr('pushAdmin.form.cooldown')} value={form.trigger.cooldownHours} onChange={(n) => setTrigger({ cooldownHours: n })} />
                <NumField label={tr('pushAdmin.form.maxPerUser')} value={form.trigger.maxPerUser} onChange={(n) => setTrigger({ maxPerUser: n })} />
              </Row>
              <Text variant="caption" tone="tertiary">
                {tr('pushAdmin.form.capNote', { n: CAMPAIGN_DAILY_CAP })}
              </Text>
            </Stack>
          )}
        </Stack>
      </Section>

      <Section title={tr('pushAdmin.form.step.audience')} index={3}>
        <Stack gap="md">
          <Segmented<Who>
            options={(['everyone', 'segment', 'picked'] as Who[]).map((w) => ({ value: w, label: tr(`pushAdmin.form.${w}`) }))}
            value={form.who}
            onChange={(w) => set({ who: w })}
          />
          {form.who === 'picked' && <TextField label={tr('pushAdmin.form.usernames')} value={form.usernames} onChangeText={(v) => set({ usernames: v })} autoCapitalize="none" multiline />}
          {form.who === 'segment' && (
            <Stack gap="md">
              <View style={{ gap: 6 }}>
                <Text variant="label" tone="muted">
                  {tr('pushAdmin.form.platform')}
                </Text>
                <Segmented<CampaignPlatform> size="sm" options={CAMPAIGN_PLATFORMS.map((p) => ({ value: p, label: tr(`pushAdmin.form.platforms.${p}`) }))} value={form.platform} onChange={(p) => set({ platform: p })} />
              </View>
              <Row gap="sm" wrap align="flex-start">
                <SegField label={tr('pushAdmin.form.inactiveDays')} value={form.inactiveDays} onChange={(v) => set({ inactiveDays: v })} />
                <SegField label={tr('pushAdmin.form.activeWithinDays')} value={form.activeWithinDays} onChange={(v) => set({ activeWithinDays: v })} />
                <SegField label={tr('pushAdmin.form.joinedWithinDays')} value={form.joinedWithinDays} onChange={(v) => set({ joinedWithinDays: v })} />
                <SegField label={tr('pushAdmin.form.minGames')} value={form.minGames} onChange={(v) => set({ minGames: v })} />
                <SegField label={tr('pushAdmin.form.maxGames')} value={form.maxGames} onChange={(v) => set({ maxGames: v })} />
              </Row>
              <TextField label={tr('pushAdmin.form.countries')} value={form.countries} onChangeText={(v) => set({ countries: v })} autoCapitalize="characters" />
            </Stack>
          )}
          <Row gap="sm" wrap>
            <Button size="sm" variant="secondary" title={tr('pushAdmin.form.checkReach')} loading={busy === 'reach'} onPress={() => void checkReach()} />
            {reach && (
              <Text tone="muted" style={{ flexShrink: 1 }}>
                {tr('pushAdmin.form.reach', { count: reach.count, push: reach.withPush })}
                {reach.sample.length ? ` ${tr('pushAdmin.form.reachSample', { names: reach.sample.join(', ') })}` : ''}
              </Text>
            )}
          </Row>
        </Stack>
      </Section>

      <Section title={tr('pushAdmin.form.name')}>
        <TextField value={form.name} onChangeText={(v) => set({ name: v })} placeholder={form.title} maxLength={80} />
      </Section>

      <ErrorLine message={error} />
      {!locked && (
        <Stack gap="sm">
          {confirm && reach && <Text variant="label">{tr('pushAdmin.form.confirmSend', { count: reach.count })}</Text>}
          <Row gap="sm" wrap>
            {!triggerOn && (
              <Button title={tr(goTitle)} variant={confirm ? 'danger' : 'primary'} loading={busy === 'go'} disabled={!!busy && busy !== 'go'} onPress={() => void save(true)} />
            )}
            <Button
              title={isNew || existing?.status === 'draft' ? tr('pushAdmin.form.saveDraft') : tr('pushAdmin.form.save')}
              variant="secondary"
              loading={busy === 'save'}
              onPress={() => void save(false)}
            />
            {confirm && <Button title={tr('admin.common.cancel')} variant="ghost" onPress={() => setConfirm(false)} />}
          </Row>
        </Stack>
      )}
    </AdminPage>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <TextField
      containerStyle={{ flex: 1, minWidth: 150 }}
      label={label}
      value={String(value)}
      keyboardType="number-pad"
      onChangeText={(v) => onChange(Math.max(0, Math.round(Number(v.replace(/\D/g, '')) || 0)))}
    />
  );
}

function SegField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <TextField containerStyle={{ flex: 1, minWidth: 150 }} label={label} value={value} keyboardType="number-pad" onChangeText={(v) => onChange(v.replace(/\D/g, ''))} />;
}

const styles = StyleSheet.create({
  lock: { flexDirection: 'row', gap: 10, padding: 12, borderWidth: StyleSheet.hairlineWidth, maxWidth: 420 },
  appIcon: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
