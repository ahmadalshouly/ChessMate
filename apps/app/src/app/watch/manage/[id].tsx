import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { EVENT_FORMATS, ROUND_SOURCE_KINDS, type EventDetail, type EventFormat, type EventRoundView, type GameResult, type RoundSourceKind } from '@chessmate/core';
import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { EventLogo, StatusPill } from '@/features/watch/components';
import { fromLocalInput, toLocalInput } from '@/features/watch/forms';
import { formatAgo, useT } from '@/i18n';
import { LOGO_MAX_CHARS, pickLogo } from '@/lib/pickLogo';
import { eventLogoUri, watchApi, type WatchMe } from '@/lib/watchApi';
import { Badge, Button, Chip, GlassView, Row, Screen, Skeleton, Stack, Switch, Text, TextField, useAppTheme } from '@/ui';

/** Error shown under the section that caused it. */
type Err = { section: string; text: string } | null;

/**
 * Manage one event (organisers of the event and admins) or create one
 * (`/watch/manage/new`, admins). Details, publishing, organisers, rounds and
 * their game sources, results, players and news.
 */
export default function ManageEvent() {
  const tr = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [me, setMe] = useState<WatchMe | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [err, setErr] = useState<Err>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    watchApi.me().then(setMe, () => {});
    if (isNew) return;
    watchApi.event(String(id)).then(setEvent, (e: Error) => setLoadError(e.message));
  }, [id, isNew]);

  /** Runs a change; the returned event replaces the one shown. */
  const run = async (section: string, f: () => Promise<EventDetail | null | void>) => {
    setBusy(section);
    setErr(null);
    try {
      const next = await f();
      if (next) setEvent(next);
      return true;
    } catch (e) {
      setErr({ section, text: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(null);
    }
  };
  const ctx = { run, err, busy };

  if (isNew) {
    return (
      <Screen scroll>
        <RouterStack.Screen options={{ title: tr('watch.manage.newTitle') }} />
        {me && !me.isAdmin ? (
          <Text tone="muted">{tr('watch.manage.adminsOnly')}</Text>
        ) : (
          <DetailsForm ctx={ctx} event={null} onSaved={(e) => router.replace(`/watch/manage/${e.id}`)} />
        )}
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen scroll>
        <RouterStack.Screen options={{ title: tr('watch.manage.title') }} />
        {loadError ? <Text tone="danger">{loadError}</Text> : <Skeleton height={200} radius="lg" />}
      </Screen>
    );
  }
  if (!event.canManage) {
    return (
      <Screen scroll>
        <RouterStack.Screen options={{ title: tr('watch.manage.title') }} />
        <Text tone="muted">{tr('watch.manage.noAccess')}</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <RouterStack.Screen options={{ title: tr('watch.manage.title') }} />
      <Row gap="md">
        <EventLogo path={event.logoPath} name={event.name} size={52} />
        <Stack gap="xxs" style={{ flex: 1 }}>
          <StatusPill status={event.status} />
          <Text variant="title">{event.name}</Text>
        </Stack>
        <Button title={tr('watch.manage.viewPage')} variant="secondary" size="sm" onPress={() => router.push(`/watch/events/${event.id}`)} />
      </Row>
      <StatusPanel ctx={ctx} event={event} isAdmin={!!me?.isAdmin} />
      <RoundsPanel ctx={ctx} event={event} />
      <PlayersPanel ctx={ctx} event={event} />
      <NewsPanel ctx={ctx} event={event} />
      <DetailsForm ctx={ctx} event={event} onSaved={setEvent} />
      <OrganizersPanel ctx={ctx} event={event} />
    </Screen>
  );
}

type Ctx = { run: (section: string, f: () => Promise<EventDetail | null | void>) => Promise<boolean>; err: Err; busy: string | null };

function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  const t = useAppTheme();
  return (
    <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
      <Row justify="space-between" gap="sm">
        <Text variant="subheading">{title}</Text>
        {right}
      </Row>
      {children}
    </GlassView>
  );
}

function ErrorText({ ctx, section }: { ctx: Ctx; section: string }) {
  return ctx.err?.section === section ? (
    <Text tone="danger" accessibilityLiveRegion="polite">
      {ctx.err.text}
    </Text>
  ) : null;
}

/** Destructive button that asks for a second tap. */
function ConfirmButton({ title, confirm, onConfirm, size = 'sm' }: { title: string; confirm: string; onConfirm: () => void; size?: 'sm' | 'md' }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <Button
      title={armed ? confirm : title}
      variant={armed ? 'danger' : 'ghost'}
      size={size}
      onPress={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 4000);
      }}
    />
  );
}

function ToggleLine({ title, detail, value, onChange, disabled }: { title: string; detail?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Row justify="space-between" gap="md">
      <Stack gap="xxs" style={{ flex: 1 }}>
        <Text>{title}</Text>
        {detail ? (
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        ) : null}
      </Stack>
      <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={title} />
    </Row>
  );
}

function StatusPanel({ ctx, event, isAdmin }: { ctx: Ctx; event: EventDetail; isAdmin: boolean }) {
  const tr = useT();
  const busy = ctx.busy === 'status';
  return (
    <Panel title={tr('watch.manage.visibility')}>
      <ToggleLine title={tr('watch.manage.published')} detail={tr('watch.manage.publishedHint')} value={event.published} disabled={busy} onChange={(v) => void ctx.run('status', () => watchApi.setFlags(event.id, { published: v }))} />
      {isAdmin && (
        <>
          <ToggleLine title={tr('watch.manage.featured')} detail={tr('watch.manage.featuredHint')} value={event.featured} disabled={busy} onChange={(v) => void ctx.run('status', () => watchApi.setFlags(event.id, { featured: v }))} />
          <ToggleLine title={tr('watch.manage.hiddenToggle')} detail={tr('watch.manage.hiddenHint')} value={event.hidden} disabled={busy} onChange={(v) => void ctx.run('status', () => watchApi.setFlags(event.id, { hidden: v }))} />
          <ConfirmButton
            title={tr('watch.manage.deleteEvent')}
            confirm={tr('watch.manage.confirmDelete')}
            onConfirm={() =>
              void ctx.run('status', async () => {
                await watchApi.deleteEvent(event.id);
                router.replace('/watch');
              })
            }
          />
        </>
      )}
      {!isAdmin && event.hidden && <Text tone="danger">{tr('watch.manage.hiddenByStaff')}</Text>}
      <ErrorText ctx={ctx} section="status" />
    </Panel>
  );
}

function DetailsForm({ ctx, event, onSaved }: { ctx: Ctx; event: EventDetail | null; onSaved: (e: EventDetail) => void }) {
  const tr = useT();
  const c = useAppTheme().colors;
  const [f, setF] = useState(() => ({
    name: event?.name ?? '',
    shortDescription: event?.shortDescription ?? '',
    description: event?.description ?? '',
    location: event?.location ?? '',
    starts: toLocalInput(event?.startsAt ?? null),
    ends: toLocalInput(event?.endsAt ?? null),
    format: (event?.format ?? 'swiss') as EventFormat,
    timeControl: event?.timeControl ?? '',
    website: event?.website ?? '',
  }));
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = () =>
    ctx.run('details', async () => {
      const startsAt = fromLocalInput(f.starts);
      const endsAt = fromLocalInput(f.ends);
      if (!startsAt || !endsAt) throw new Error(tr('watch.apply.dateFormat'));
      const body = { ...f, startsAt, endsAt, website: f.website.trim() || null, ...(logo !== undefined ? { logo } : {}) };
      const saved = event ? await watchApi.updateEvent(event.id, body) : await watchApi.createEvent(body);
      setLogo(undefined);
      onSaved(saved);
      return saved;
    });
  const preview = logo ?? (logo === undefined ? eventLogoUri(event?.logoPath ?? null) : null);
  return (
    <Panel title={event ? tr('watch.manage.details') : tr('watch.manage.newTitle')}>
      <TextField label={tr('watch.apply.eventName')} value={f.name} onChangeText={set('name')} maxLength={120} />
      <TextField label={tr('watch.manage.summary')} value={f.shortDescription} onChangeText={set('shortDescription')} maxLength={200} />
      <TextField label={tr('watch.apply.description')} value={f.description} onChangeText={set('description')} multiline numberOfLines={6} maxLength={8000} />
      <TextField label={tr('watch.fields.location')} value={f.location} onChangeText={set('location')} maxLength={120} />
      <Row gap="md">
        <TextField containerStyle={{ flex: 1 }} label={tr('watch.apply.starts')} value={f.starts} onChangeText={set('starts')} placeholder="2026-03-14 15:00" />
        <TextField containerStyle={{ flex: 1 }} label={tr('watch.apply.ends')} value={f.ends} onChangeText={set('ends')} placeholder="2026-03-20 20:00" />
      </Row>
      <Text variant="label" tone="muted">
        {tr('watch.fields.format')}
      </Text>
      <Row gap="xs" wrap>
        {EVENT_FORMATS.map((fm) => (
          <Chip key={fm} label={tr(`watch.formats.${fm}`)} selected={f.format === fm} onPress={() => setF((x) => ({ ...x, format: fm }))} />
        ))}
      </Row>
      <TextField label={tr('watch.fields.timeControl')} value={f.timeControl} onChangeText={set('timeControl')} maxLength={60} placeholder="90+30" />
      <TextField label={tr('watch.website')} value={f.website} onChangeText={set('website')} autoCapitalize="none" keyboardType="url" placeholder="https://" />
      <Row gap="md" wrap>
        {preview ? <Image source={{ uri: preview }} style={[styles.logo, { borderColor: c.border }]} resizeMode="contain" accessibilityLabel={tr('watch.manage.logo')} /> : null}
        <Button
          title={preview ? tr('watch.manage.replaceLogo') : tr('watch.manage.uploadLogo')}
          variant="secondary"
          size="sm"
          onPress={async () => {
            try {
              const url = await pickLogo();
              if (!url) return;
              if (url.length > LOGO_MAX_CHARS) throw new Error(tr('watch.manage.logoTooBig'));
              setLogo(url);
            } catch (e) {
              void ctx.run('details', async () => {
                throw e;
              });
            }
          }}
        />
        {preview ? <Button title={tr('watch.manage.removeLogo')} variant="ghost" size="sm" onPress={() => setLogo(null)} /> : null}
      </Row>
      <ErrorText ctx={ctx} section="details" />
      <Button title={event ? tr('watch.save') : tr('watch.manage.create')} loading={ctx.busy === 'details'} onPress={() => void save()} />
    </Panel>
  );
}

function OrganizersPanel({ ctx, event }: { ctx: Ctx; event: EventDetail }) {
  const tr = useT();
  const [name, setName] = useState('');
  return (
    <Panel title={tr('watch.manage.organizers')}>
      <Text variant="caption" tone="muted">
        {tr('watch.manage.organizersHint')}
      </Text>
      {(event.organizers ?? []).map((o) => (
        <Row key={o.userId} justify="space-between" gap="sm">
          <Text>
            {o.displayName} <Text tone="muted">@{o.username}</Text>
          </Text>
          <ConfirmButton title={tr('watch.manage.remove')} confirm={tr('watch.manage.confirmRemove')} onConfirm={() => void ctx.run('organizers', async () => (await watchApi.removeOrganizer(event.id, o.userId)) ?? router.replace('/watch'))} />
        </Row>
      ))}
      <Row gap="sm">
        <TextField containerStyle={{ flex: 1 }} value={name} onChangeText={setName} placeholder={tr('watch.manage.username')} autoCapitalize="none" accessibilityLabel={tr('watch.manage.username')} />
        <Button
          title={tr('watch.manage.add')}
          variant="secondary"
          loading={ctx.busy === 'organizers'}
          onPress={() =>
            void ctx.run('organizers', async () => {
              const e = await watchApi.addOrganizer(event.id, name.trim());
              setName('');
              return e;
            })
          }
        />
      </Row>
      <ErrorText ctx={ctx} section="organizers" />
    </Panel>
  );
}

function RoundsPanel({ ctx, event }: { ctx: Ctx; event: EventDetail }) {
  const tr = useT();
  const [open, setOpen] = useState<string | null>(event.currentRound?.id ?? null);
  const [adding, setAdding] = useState(false);
  return (
    <Panel title={tr('watch.manage.rounds')} right={<Button title={tr('watch.manage.addRound')} variant="secondary" size="sm" onPress={() => setAdding((a) => !a)} />}>
      {adding && <RoundForm ctx={ctx} eventId={event.id} round={null} nextNumber={event.rounds.length + 1} onDone={() => setAdding(false)} />}
      {event.rounds.length === 0 && !adding && <Text tone="muted">{tr('watch.manage.noRounds')}</Text>}
      {event.rounds.map((r) => (
        <RoundCard key={r.id} ctx={ctx} eventId={event.id} round={r} open={open === r.id} onToggle={() => setOpen((o) => (o === r.id ? null : r.id))} />
      ))}
      <ErrorText ctx={ctx} section="rounds" />
    </Panel>
  );
}

function RoundForm({ ctx, eventId, round, nextNumber, onDone }: { ctx: Ctx; eventId: string; round: EventRoundView | null; nextNumber: number; onDone: () => void }) {
  const tr = useT();
  const [number, setNumber] = useState(String(round?.number ?? nextNumber));
  const [name, setName] = useState(round?.name ?? '');
  const [starts, setStarts] = useState(toLocalInput(round?.startsAt ?? null));
  const [kind, setKind] = useState<RoundSourceKind>(round?.source?.kind ?? 'manual');
  const [url, setUrl] = useState(round?.source?.url ?? (round?.source?.lichessRoundId ? `https://lichess.org/broadcast/-/-/${round.source.lichessRoundId}` : ''));
  const section = round ? `round-${round.id}` : 'rounds';
  const save = () =>
    ctx.run(section, async () => {
      const body = { number: Number(number), name: name.trim(), startsAt: starts.trim() ? fromLocalInput(starts) : null, source: { kind, url: url.trim() } };
      const e = round ? await watchApi.updateRound(round.id, body) : await watchApi.addRound(eventId, body);
      onDone();
      return e;
    });
  return (
    <Stack gap="sm">
      <Row gap="md">
        <TextField containerStyle={{ width: 90 }} label={tr('watch.manage.roundNumber')} value={number} onChangeText={setNumber} keyboardType="number-pad" />
        <TextField containerStyle={{ flex: 1 }} label={tr('watch.manage.roundName')} value={name} onChangeText={setName} placeholder={tr('watch.manage.roundNamePlaceholder', { n: number })} maxLength={60} />
      </Row>
      <TextField label={tr('watch.manage.roundStarts')} value={starts} onChangeText={setStarts} placeholder="2026-03-14 15:00" />
      <Text variant="label" tone="muted">
        {tr('watch.manage.gamesFrom')}
      </Text>
      <Row gap="xs" wrap>
        {ROUND_SOURCE_KINDS.map((k) => (
          <Chip key={k} label={tr(`watch.sources.${k}`)} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </Row>
      <Text variant="caption" tone="muted">
        {tr(`watch.sourceHints.${kind}`)}
      </Text>
      {kind !== 'manual' && (
        <TextField value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder={kind === 'lichess' ? 'https://lichess.org/broadcast/…/…/abcd1234' : 'https://…/games.pgn'} accessibilityLabel={tr('watch.manage.sourceLink')} />
      )}
      <ErrorText ctx={ctx} section={section} />
      <Row gap="sm">
        <Button title={round ? tr('watch.save') : tr('watch.manage.addRound')} loading={ctx.busy === section} onPress={() => void save()} />
        <Button title={tr('common.cancel')} variant="ghost" onPress={onDone} />
      </Row>
    </Stack>
  );
}

const RESULTS: GameResult[] = ['1-0', '1/2-1/2', '0-1', '*'];

function RoundCard({ ctx, eventId, round, open, onToggle }: { ctx: Ctx; eventId: string; round: EventRoundView; open: boolean; onToggle: () => void }) {
  const tr = useT();
  const t = useAppTheme();
  const [editing, setEditing] = useState(false);
  const [pgn, setPgn] = useState('');
  const [replace, setReplace] = useState(false);
  const [white, setWhite] = useState('');
  const [black, setBlack] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const section = `round-${round.id}`;
  const src = round.source;
  return (
    <View style={[styles.round, { borderColor: t.colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle}>
        <Row justify="space-between" gap="sm">
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="bodyStrong">{round.name}</Text>
            <Text variant="caption" tone="muted">
              {[tr(`watch.status.${round.status}`), tr('watch.boards', { count: round.games.length }), src ? tr(`watch.sources.${src.kind}`) : null].filter(Boolean).join(' · ')}
            </Text>
          </Stack>
          <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={t.colors.muted} />
        </Row>
      </Pressable>
      {open && (
        <Stack gap="md" style={{ marginTop: t.space.md }}>
          {src && src.kind !== 'manual' && (
            <Stack gap="xs">
              <Text variant="caption" tone={src.syncError ? 'danger' : 'muted'}>
                {src.syncError ? tr('watch.manage.syncError', { error: src.syncError }) : src.lastSyncAt ? tr('watch.manage.lastSync', { when: formatAgo(src.lastSyncAt) }) : tr('watch.manage.notSyncedYet')}
              </Text>
              <Button
                title={tr('watch.manage.syncNow')}
                variant="secondary"
                size="sm"
                onPress={() =>
                  void ctx.run(section, async () => {
                    await watchApi.syncRound(round.id);
                    setNotice(tr('watch.manage.syncQueued'));
                  })
                }
              />
            </Stack>
          )}
          {editing ? (
            <RoundForm ctx={ctx} eventId={eventId} round={round} nextNumber={round.number} onDone={() => setEditing(false)} />
          ) : (
            <Row gap="sm" wrap>
              <Button title={tr('watch.manage.editRound')} variant="secondary" size="sm" onPress={() => setEditing(true)} />
              <ConfirmButton title={tr('watch.manage.deleteRound')} confirm={tr('watch.manage.confirmDelete')} onConfirm={() => void ctx.run(section, () => watchApi.removeRound(round.id))} />
            </Row>
          )}

          <Stack gap="sm">
            <Text variant="label">{tr('watch.manage.pastePgn')}</Text>
            <TextField value={pgn} onChangeText={setPgn} multiline numberOfLines={5} placeholder={'[White "…"]\n[Black "…"]\n\n1. e4 e5 …'} autoCapitalize="none" autoCorrect={false} accessibilityLabel={tr('watch.manage.pastePgn')} />
            <ToggleLine title={tr('watch.manage.replaceGames')} detail={tr('watch.manage.replaceGamesHint')} value={replace} onChange={setReplace} />
            <Button
              title={tr('watch.manage.importPgn')}
              variant="secondary"
              loading={ctx.busy === section}
              disabled={!pgn.trim()}
              onPress={() =>
                void ctx.run(section, async () => {
                  const r = await watchApi.pastePgn(round.id, pgn, replace);
                  setPgn('');
                  setNotice(tr('watch.manage.imported', { count: r.games }));
                  return watchApi.event(eventId);
                })
              }
            />
          </Stack>

          <Stack gap="sm">
            <Text variant="label">{tr('watch.manage.addPairing')}</Text>
            <Row gap="sm">
              <TextField containerStyle={{ flex: 1 }} value={white} onChangeText={setWhite} placeholder={tr('watch.manage.white')} accessibilityLabel={tr('watch.manage.white')} />
              <TextField containerStyle={{ flex: 1 }} value={black} onChangeText={setBlack} placeholder={tr('watch.manage.black')} accessibilityLabel={tr('watch.manage.black')} />
            </Row>
            <Button
              title={tr('watch.manage.add')}
              variant="secondary"
              size="sm"
              disabled={!white.trim() || !black.trim()}
              onPress={() =>
                void ctx.run(section, async () => {
                  const e = await watchApi.addPairing(round.id, { white: white.trim(), black: black.trim() });
                  setWhite('');
                  setBlack('');
                  return e;
                })
              }
            />
          </Stack>

          {round.games.length > 0 && (
            <Stack gap="xs">
              <Text variant="label">{tr('watch.manage.results')}</Text>
              {[...round.games]
                .sort((a, b) => a.board - b.board)
                .map((g) => (
                  <View key={g.id} style={[styles.gameRow, { borderColor: t.colors.border }]}>
                    <Text numberOfLines={1} style={{ flex: 1, minWidth: 140 }}>
                      {g.board}. {g.white.name} – {g.black.name}
                    </Text>
                    <Row gap="xxs" wrap>
                      {RESULTS.map((r) => (
                        <Chip key={r} label={r === '1/2-1/2' ? '½' : r} selected={g.result === r} onPress={() => void ctx.run(section, () => watchApi.setResult(g.id, r))} />
                      ))}
                      <Pressable accessibilityRole="button" accessibilityLabel={tr('watch.manage.deleteGame')} hitSlop={8} onPress={() => void ctx.run(section, () => watchApi.removeGame(g.id))}>
                        <MaterialCommunityIcons name="delete-outline" size={20} color={t.colors.muted} />
                      </Pressable>
                    </Row>
                  </View>
                ))}
            </Stack>
          )}
          {notice && <Text tone="success">{notice}</Text>}
          <ErrorText ctx={ctx} section={section} />
        </Stack>
      )}
    </View>
  );
}

function PlayersPanel({ ctx, event }: { ctx: Ctx; event: EventDetail }) {
  const tr = useT();
  const t = useAppTheme();
  const empty = { name: '', title: '', rating: '', federation: '', fideId: '', username: '' };
  const [f, setF] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const set = (k: keyof typeof empty) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = () =>
    ctx.run('players', async () => {
      const body = { ...f, rating: f.rating.trim() ? Number(f.rating) : null };
      const e = editing ? await watchApi.updatePlayer(editing, body) : await watchApi.addPlayer(event.id, body);
      setF(empty);
      setEditing(null);
      return e;
    });
  return (
    <Panel title={tr('watch.manage.players', { count: event.players.length })}>
      <Text variant="caption" tone="muted">
        {tr('watch.manage.playersHint')}
      </Text>
      {event.players.map((p) => (
        <Row key={p.id} justify="space-between" gap="sm" style={[styles.playerRow, { borderColor: t.colors.border }]}>
          <Pressable
            style={{ flex: 1 }}
            accessibilityRole="button"
            onPress={() => {
              setEditing(p.id);
              setF({ name: p.name, title: p.title ?? '', rating: p.rating ? String(p.rating) : '', federation: p.federation ?? '', fideId: p.fideId ?? '', username: p.username ?? '' });
            }}>
            <Text numberOfLines={1}>
              {[p.title, p.name].filter(Boolean).join(' ')} <Text tone="muted">{[p.rating, p.federation, p.username ? `@${p.username}` : null].filter(Boolean).join(' · ')}</Text>
            </Text>
          </Pressable>
          <ConfirmButton title={tr('watch.manage.remove')} confirm={tr('watch.manage.confirmRemove')} onConfirm={() => void ctx.run('players', () => watchApi.removePlayer(p.id))} />
        </Row>
      ))}
      <Stack gap="sm">
        <Text variant="label">{editing ? tr('watch.manage.editPlayer') : tr('watch.manage.addPlayer')}</Text>
        <TextField value={f.name} onChangeText={set('name')} placeholder={tr('watch.player')} accessibilityLabel={tr('watch.player')} maxLength={80} />
        <Row gap="sm">
          <TextField containerStyle={{ flex: 1 }} value={f.title} onChangeText={set('title')} placeholder={tr('watch.manage.title_')} autoCapitalize="characters" maxLength={4} accessibilityLabel={tr('watch.manage.title_')} />
          <TextField containerStyle={{ flex: 1 }} value={f.rating} onChangeText={set('rating')} placeholder={tr('watch.manage.rating')} keyboardType="number-pad" accessibilityLabel={tr('watch.manage.rating')} />
          <TextField containerStyle={{ flex: 1 }} value={f.federation} onChangeText={set('federation')} placeholder={tr('watch.manage.federation')} autoCapitalize="characters" maxLength={2} accessibilityLabel={tr('watch.manage.federation')} />
        </Row>
        <Row gap="sm">
          <TextField containerStyle={{ flex: 1 }} value={f.fideId} onChangeText={set('fideId')} placeholder="FIDE ID" keyboardType="number-pad" accessibilityLabel="FIDE ID" />
          <TextField containerStyle={{ flex: 1 }} value={f.username} onChangeText={set('username')} placeholder={tr('watch.manage.linkAccount')} autoCapitalize="none" accessibilityLabel={tr('watch.manage.linkAccount')} />
        </Row>
        <ErrorText ctx={ctx} section="players" />
        <Row gap="sm">
          <Button title={editing ? tr('watch.save') : tr('watch.manage.add')} variant="secondary" loading={ctx.busy === 'players'} disabled={!f.name.trim()} onPress={() => void save()} />
          {editing && (
            <Button
              title={tr('common.cancel')}
              variant="ghost"
              onPress={() => {
                setEditing(null);
                setF(empty);
              }}
            />
          )}
        </Row>
      </Stack>
    </Panel>
  );
}

function NewsPanel({ ctx, event }: { ctx: Ctx; event: EventDetail }) {
  const tr = useT();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <Panel title={tr('watch.tabs.news')}>
      <TextField value={title} onChangeText={setTitle} placeholder={tr('watch.manage.newsTitle')} maxLength={140} accessibilityLabel={tr('watch.manage.newsTitle')} />
      <TextField value={body} onChangeText={setBody} placeholder={tr('watch.manage.newsBody')} multiline numberOfLines={4} maxLength={8000} accessibilityLabel={tr('watch.manage.newsBody')} />
      <ErrorText ctx={ctx} section="news" />
      <Button
        title={tr('watch.manage.post')}
        variant="secondary"
        loading={ctx.busy === 'news'}
        disabled={!title.trim() || !body.trim()}
        onPress={() =>
          void ctx.run('news', async () => {
            const e = await watchApi.addNews(event.id, { title: title.trim(), body: body.trim() });
            setTitle('');
            setBody('');
            return e;
          })
        }
      />
      {event.news.map((n) => (
        <Row key={n.id} justify="space-between" gap="sm">
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {n.title}
            </Text>
            <Text variant="caption" tone="muted">
              {formatAgo(n.createdAt)}
            </Text>
          </Stack>
          <ConfirmButton title={tr('watch.manage.remove')} confirm={tr('watch.manage.confirmRemove')} onConfirm={() => void ctx.run('news', () => watchApi.removeNews(n.id))} />
        </Row>
      ))}
      {event.news.length === 0 && <Badge label={tr('watch.noNews')} size="sm" />}
    </Panel>
  );
}

const styles = StyleSheet.create({
  logo: { width: 64, height: 64, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  round: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14 },
  gameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  playerRow: { paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
});
