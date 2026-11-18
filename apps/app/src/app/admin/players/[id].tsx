import {
  ACCOUNT_CLOSE_REASONS,
  CHESS_TITLES,
  MUTE_PRESETS_HOURS,
  ROLE_TAGS,
  TITLE_REVOKE_REASONS,
  WARNING_CATEGORIES,
  type AccountCloseReason,
  type AdminPlayerDetail,
  type ChessTitle,
  type RatingCategory,
  type RoleTag,
  type StaffRole,
  type TitleRevokeReason,
} from '@chessmate/core';
import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionDialog, ChoiceField, ReasonField } from '@/features/admin/ActionDialog';
import { useAdmin } from '@/features/admin/AdminContext';
import { AuditRow } from '@/features/admin/AuditRow';
import { AdminPage, EmptyState, ErrorLine, Field, GameRow, PlayerBadges, Section, useLoad } from '@/features/admin/ui';
import { RoleTagBadge } from '@/features/titles/RoleTagBadge';
import { TITLE_STATUS_TONE, TitleBadge } from '@/features/titles/TitleBadge';
import { formatAgo, formatDate, formatDateTime, translateOr, useT } from '@/i18n';
import { Avatar, Badge, Button, Row, Stack, Text, TextField, useAppTheme } from '@/ui';

type Dialog = 'warn' | 'mute' | 'unmute' | 'rename' | 'rating' | 'role' | 'signout' | 'close' | 'reopen' | 'review' | 'setTitle' | 'removeTitle' | 'setTag' | 'removeTag' | null;
const poolLabel = (k: RatingCategory) => (k === 'puzzle' ? translateOr('nav.puzzles', 'Puzzles') : translateOr(`common.category.${k}`, k));
const POOLS: RatingCategory[] = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence', 'puzzle'];

export default function AdminPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const { api, can, me } = useAdmin();
  const { data: p, error, loading, reload } = useLoad(() => api.player(String(id)), [api, id]);
  const [dialog, setDialog] = useState<Dialog>(null);

  if (!p) {
    return (
      <AdminPage>
        <RouterStack.Screen options={{ title: tr('admin.nav.players'), headerShown: true }} />
        {loading ? <Text tone="muted">{tr('admin.common.loading')}</Text> : <EmptyState icon="person-outline" title={tr('admin.player.notFound')} body={error ?? undefined} />}
      </AdminPage>
    );
  }

  const self = p.id === me.id;
  const closed = p.status === 'closed';
  return (
    <AdminPage onRefresh={reload} refreshing={loading}>
      <RouterStack.Screen options={{ title: p.username, headerShown: true }} />
      <Header p={p} />

      <Section title={tr('admin.player.actions')} index={1}>
        <Row gap="sm" wrap>
          {can('players.warn') && <Button size="sm" variant="secondary" title={tr('admin.player.warn')} onPress={() => setDialog('warn')} />}
          {can('players.mute') &&
            (p.chatMute ? (
              <Button size="sm" variant="secondary" title={tr('admin.player.unmute')} onPress={() => setDialog('unmute')} />
            ) : (
              <Button size="sm" variant="secondary" title={tr('admin.player.mute')} onPress={() => setDialog('mute')} />
            ))}
          {can('players.rename') && <Button size="sm" variant="secondary" title={tr('admin.player.rename')} onPress={() => setDialog('rename')} />}
          {can('ratings.adjust') && <Button size="sm" variant="secondary" title={tr('admin.player.rating')} onPress={() => setDialog('rating')} />}
          {can('roles.manage') && !self && !closed && <Button size="sm" variant="secondary" title={tr('admin.player.role')} onPress={() => setDialog('role')} />}
          {can('players.signout') && <Button size="sm" variant="secondary" title={tr('admin.player.signOut')} onPress={() => setDialog('signout')} />}
          {can('fairplay.review') && p.fairPlay !== 'open' && p.fairPlay !== 'banned' && (
            <Button size="sm" variant="secondary" title={tr('admin.player.review')} onPress={() => setDialog('review')} />
          )}
          {can('titles.revoke') && !closed && <Button size="sm" variant="secondary" title={tr('admin.titles.set')} onPress={() => setDialog('setTitle')} />}
          {can('titles.revoke') && p.title && <Button size="sm" variant="secondary" title={tr('admin.titles.remove')} onPress={() => setDialog('removeTitle')} />}
          {can('tags.manage') && !closed && <Button size="sm" variant="secondary" title={p.roleTag ? tr('admin.tags.change') : tr('admin.tags.set')} onPress={() => setDialog('setTag')} />}
          {p.playingGameId && can('games.view') && <Button size="sm" variant="secondary" title={tr('admin.player.watch')} onPress={() => router.push(`/admin/games/${p.playingGameId}`)} />}
          {closed
            ? can('accounts.reopen') && <Button size="sm" title={tr('admin.player.reopen')} onPress={() => setDialog('reopen')} />
            : can('accounts.close') && !self && p.role === 'user' && <Button size="sm" variant="danger" title={tr('admin.player.close')} onPress={() => setDialog('close')} />}
        </Row>
      </Section>

      <Row gap="xl" align="flex-start" wrap>
        <Stack gap="xl" style={{ flexGrow: 1, flexBasis: 420 }}>
          <Standing p={p} />
          <Ratings p={p} />
          <Section title={tr('admin.player.recentGames')} index={4} padding="none">
            {p.recentGames.length === 0 ? <EmptyState icon="grid-outline" title={tr('admin.player.noGames')} /> : p.recentGames.map((g, i) => <GameRow key={g.id} g={g} tr={tr} last={i === p.recentGames.length - 1} />)}
          </Section>
          <Reports p={p} />
        </Stack>
        <Stack gap="xl" style={{ flexGrow: 1, flexBasis: 340 }}>
          <Warnings p={p} />
          <Notes p={p} onAdded={reload} />
          <Titles p={p} />
          <RoleTagSection p={p} onSet={() => setDialog('setTag')} onRemove={() => setDialog('removeTag')} />
          {can('audit.view') && (
            <Section title={tr('admin.player.history')} index={8} padding="none">
              {p.audit.length === 0 ? <EmptyState icon="document-text-outline" title={tr('admin.player.noHistory')} /> : p.audit.map((e, i) => <AuditRow key={e.id} e={e} last={i === p.audit.length - 1} compact />)}
            </Section>
          )}
        </Stack>
      </Row>

      <Dialogs p={p} dialog={dialog} close={() => setDialog(null)} done={reload} />
    </AdminPage>
  );
}

function Header({ p }: { p: AdminPlayerDetail }) {
  const tr = useT();
  return (
    <Stack gap="lg">
      <Row gap="lg" align="center" wrap>
        <Avatar name={p.username} size={64} status={p.playingGameId ? 'playing' : p.online ? 'online' : 'offline'} />
        <Stack gap="xs" style={{ flex: 1, minWidth: 220 }}>
          <Text variant="title" selectable>
            {p.username}
          </Text>
          {p.displayName !== p.username && <Text tone="muted">{p.displayName}</Text>}
          <PlayerBadges p={p} />
        </Stack>
      </Row>
      <Row gap="lg" wrap align="flex-start">
        <Field label={tr('admin.player.id')} value={p.id} mono />
        {p.email !== null && <Field label={tr('admin.player.email')} value={p.email || '–'} />}
        <Field label={tr('admin.player.country')} value={p.country ?? '–'} />
        <Field label={tr('admin.player.joined', { date: '' }).replace(/\s*$/, '')} value={formatDate(p.createdAt)} />
        <Field label={tr('admin.player.lastSeen', { when: '' }).replace(/\s*$/, '')} value={p.lastSeenAt ? formatAgo(p.lastSeenAt) : p.online ? tr('admin.status.online') : '–'} />
      </Row>
    </Stack>
  );
}

function Titles({ p }: { p: AdminPlayerDetail }) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  return (
    <Section title={tr('admin.titles.section')} index={9} padding="none">
      <Row gap="sm" style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        {p.title ? <TitleBadge title={p.title} size="md" /> : null}
        <Text tone={p.title ? 'default' : 'muted'} style={{ flex: 1 }}>
          {p.title
            ? `${tr(`chessTitle.names.${p.title}`)}${p.titleGrantedAt ? ` · ${tr('admin.titles.since', { date: formatDate(p.titleGrantedAt) })}` : ''}`
            : tr('admin.titles.none')}
        </Text>
      </Row>
      {p.titleApplications.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          onPress={() => router.push(`/admin/titles/${encodeURIComponent(a.id)}`)}
          style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.appRow, { borderTopColor: c.border }, hovered && { backgroundColor: c.surfaceSunken }]}>
          <Text variant="bodyStrong" style={{ width: 44 }}>
            {a.title}
          </Text>
          <Text variant="caption" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
            {[formatDate(a.createdAt), a.reviewNote].filter(Boolean).join(' · ')}
          </Text>
          <Badge label={tr(`admin.titles.tabs.${a.status}`)} tone={TITLE_STATUS_TONE[a.status]} />
        </Pressable>
      ))}
    </Section>
  );
}

/** The official role tag: what it is, and change / remove for admins. */
function RoleTagSection({ p, onSet, onRemove }: { p: AdminPlayerDetail; onSet: () => void; onRemove: () => void }) {
  const tr = useT();
  const { can } = useAdmin();
  const manage = can('tags.manage');
  return (
    <Section
      title={tr('admin.tags.section')}
      index={10}
      action={
        manage && p.roleTag ? <Button size="sm" variant="ghost" title={tr('admin.tags.remove')} onPress={onRemove} /> : manage && p.status !== 'closed' ? <Button size="sm" variant="ghost" title={tr('admin.tags.set')} onPress={onSet} /> : undefined
      }>
      <Stack gap="sm">
        <Row gap="sm">
          {p.roleTag ? <RoleTagBadge tag={p.roleTag} size="md" /> : <Text tone="muted">{tr('admin.tags.none')}</Text>}
        </Row>
        <Text variant="caption" tone="tertiary">
          {tr('admin.tags.hint')}
        </Text>
      </Stack>
    </Section>
  );
}

function Standing({ p }: { p: AdminPlayerDetail }) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  const lines: { tone: 'danger' | 'warning' | 'muted'; text: string; action?: () => void }[] = [];
  if (p.closed) {
    lines.push({
      tone: 'danger',
      text: tr('admin.player.closedBanner', { date: formatDateTime(p.closed.at), by: p.closed.by ?? tr('admin.audit.system'), reason: `${translateOr(`admin.closeReasons.${p.closed.reason}`, p.closed.reason)}${p.closed.note ? ` (${p.closed.note})` : ''}` }),
    });
  }
  if (p.chatMute) lines.push({ tone: 'warning', text: tr('admin.player.mutedBanner', { date: formatDateTime(p.chatMute.until), reason: p.chatMute.reason }) });
  if (p.fairPlayCase) {
    lines.push({
      tone: p.fairPlayCase.status === 'open' ? 'warning' : 'muted',
      text: tr('admin.player.fairPlayCase', { status: tr(`admin.fairplay.tabs.${p.fairPlayCase.status}`), score: p.fairPlayCase.score }),
      action: () => router.push(`/admin/fairplay/${encodeURIComponent(p.id)}`),
    });
  }
  if (lines.length === 0) return null;
  return (
    <Section title={tr('admin.player.standing')} index={2}>
      <Stack gap="md">
        {lines.map((l) => (
          <Row key={l.text} gap="sm" justify="space-between" wrap>
            <Row gap="sm" style={{ flex: 1, minWidth: 220 }}>
              <View style={[styles.dot, { backgroundColor: l.tone === 'muted' ? c.textTertiary : c[l.tone] }]} />
              <Text style={{ flex: 1 }}>{l.text}</Text>
            </Row>
            {l.action && <Button size="sm" variant="ghost" title={tr('admin.player.openCase')} onPress={l.action} />}
          </Row>
        ))}
      </Stack>
    </Section>
  );
}

function Ratings({ p }: { p: AdminPlayerDetail }) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  return (
    <Section title={tr('admin.player.ratings')} index={3} padding="none">
      <View style={[styles.tr, { borderBottomColor: c.border }]}>
        {[tr('admin.player.pool'), tr('admin.player.ratings'), tr('admin.player.games'), tr('admin.player.record'), tr('admin.player.peak')].map((h, i) => (
          <Text key={h} variant="overline" tone="tertiary" style={i === 0 ? styles.c0 : styles.cn}>
            {h}
          </Text>
        ))}
      </View>
      {p.ratings.map((r, i) => (
        <View key={r.category} style={[styles.tr, i < p.ratings.length - 1 && { borderBottomColor: c.border }]}>
          <Text variant="label" style={styles.c0}>
            {poolLabel(r.category)}
          </Text>
          <Text variant="numeric" style={styles.cn}>
            {`${r.rating}${r.provisional ? '?' : ''}`}
          </Text>
          <Text variant="numeric" tone="muted" style={styles.cn}>
            {r.games}
          </Text>
          <Text variant="numeric" tone="muted" style={styles.cn}>
            {`${r.wins}/${r.losses}/${r.draws}`}
          </Text>
          <Text variant="numeric" tone="muted" style={styles.cn}>
            {r.peak ?? '–'}
          </Text>
        </View>
      ))}
    </Section>
  );
}

function Reports({ p }: { p: AdminPlayerDetail }) {
  const tr = useT();
  return (
    <Section title={tr('admin.player.reportsAgainst')} index={5} action={<Text variant="caption" tone="tertiary">{tr('admin.player.reportsFiled', { count: p.reportsFiled })}</Text>}>
      {p.reportsAgainst.length === 0 ? (
        <Text tone="muted">{tr('admin.player.noReports')}</Text>
      ) : (
        <Stack gap="md">
          {p.reportsAgainst.map((r) => (
            <Stack key={r.id} gap="xxs">
              <Row gap="sm" wrap>
                <Text variant="bodyStrong">{translateOr(`report.reasons.${r.reason}`, r.reason)}</Text>
                <Badge label={tr(`admin.reports.tabs.${r.status}`)} tone={r.status === 'open' ? 'warning' : 'neutral'} />
              </Row>
              <Text variant="caption" tone="muted">
                {tr('admin.reports.reportedBy', { name: r.reporterName, when: formatAgo(r.createdAt) })}
              </Text>
              {!!r.note && <Text variant="caption">{`“${r.note}”`}</Text>}
            </Stack>
          ))}
        </Stack>
      )}
    </Section>
  );
}

function Warnings({ p }: { p: AdminPlayerDetail }) {
  const tr = useT();
  return (
    <Section title={tr('admin.player.warnings')} index={6}>
      {p.warnings.length === 0 ? (
        <Text tone="muted">{tr('admin.player.noWarnings')}</Text>
      ) : (
        <Stack gap="md">
          {p.warnings.map((w) => (
            <Stack key={w.id} gap="xxs">
              <Row gap="sm" wrap>
                <Badge label={translateOr(`report.reasons.${w.category}`, w.category)} tone="warning" />
                <Text variant="caption" tone="tertiary">
                  {`${formatDateTime(w.at)} · ${tr('admin.common.by', { name: w.issuedByName })}`}
                </Text>
              </Row>
              <Text>{w.message}</Text>
            </Stack>
          ))}
        </Stack>
      )}
    </Section>
  );
}

function Notes({ p, onAdded }: { p: AdminPlayerDetail; onAdded: () => void }) {
  const tr = useT();
  const { api, can } = useAdmin();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    setBusy(true);
    try {
      await api.note(p.id, note);
      setNote('');
      setError(null);
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={tr('admin.player.notes')} index={7}>
      <Stack gap="md">
        {p.notes.length === 0 ? (
          <Text tone="muted">{tr('admin.player.noNotes')}</Text>
        ) : (
          p.notes.map((n) => (
            <Stack key={n.id} gap="xxs">
              <Text>{n.reason}</Text>
              <Text variant="caption" tone="tertiary">{`${n.actorName} · ${formatDateTime(n.at)}`}</Text>
            </Stack>
          ))
        )}
        {can('players.note') && (
          <Row gap="sm" align="flex-end">
            <View style={{ flex: 1 }}>
              <TextField value={note} onChangeText={setNote} placeholder={tr('admin.player.addNote')} multiline maxLength={2000} />
            </View>
            <Button title={tr('admin.common.save')} size="sm" disabled={!note.trim()} loading={busy} onPress={() => void add()} />
          </Row>
        )}
        <ErrorLine message={error} />
      </Stack>
    </Section>
  );
}

function Dialogs({ p, dialog, close, done }: { p: AdminPlayerDetail; dialog: Dialog; close: () => void; done: () => void }) {
  const tr = useT();
  const { api, can } = useAdmin();
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<string>('abusive_chat');
  const [hours, setHours] = useState<number>(24);
  const [username, setUsername] = useState(p.username);
  const [pool, setPool] = useState<RatingCategory>('blitz');
  const [delta, setDelta] = useState('');
  const [role, setRole] = useState<StaffRole>(p.role);
  const [closeReason, setCloseReason] = useState<AccountCloseReason>('abuse');
  const [title, setTitle] = useState<ChessTitle>(p.title ?? 'GM');
  const [revokeReason, setRevokeReason] = useState<TitleRevokeReason>('fair_play');
  const [tag, setTag] = useState<RoleTag>(p.roleTag ?? 'streamer');
  const run = (fn: () => Promise<unknown>) => async () => {
    await fn();
    setReason('');
    done();
  };
  const name = p.username;
  const current = p.ratings.find((r) => r.category === pool)?.rating ?? 1500;
  const d = Number(delta);
  const common = { visible: true, onClose: close };

  switch (dialog) {
    case 'warn':
      return (
        <ActionDialog {...common} title={tr('admin.dialogs.warnTitle', { name })} description={tr('admin.dialogs.warnBody')} confirmLabel={tr('admin.player.warn')} disabled={!reason.trim()} onConfirm={run(() => api.warn(p.id, category, reason))}>
          <ChoiceField label={tr('admin.dialogs.category')} value={category} onChange={setCategory} options={WARNING_CATEGORIES.map((k) => ({ key: k, label: translateOr(`report.reasons.${k}`, k) }))} />
          <ReasonField label={tr('admin.dialogs.message')} value={reason} onChange={setReason} multiline />
        </ActionDialog>
      );
    case 'mute':
      return (
        <ActionDialog {...common} title={tr('admin.dialogs.muteTitle', { name })} description={tr('admin.dialogs.muteBody')} confirmLabel={tr('admin.player.mute')} danger onConfirm={run(() => api.mute(p.id, hours, reason))}>
          <ChoiceField
            label={tr('admin.dialogs.duration')}
            value={String(hours)}
            onChange={(v) => setHours(Number(v))}
            options={MUTE_PRESETS_HOURS.map((h) => ({ key: String(h), label: h < 48 ? tr('admin.dialogs.hours', { count: h }) : tr('admin.dialogs.days', { count: h / 24 }) }))}
          />
          <ReasonField value={reason} onChange={setReason} label={tr('admin.common.reason')} />
        </ActionDialog>
      );
    case 'unmute':
      return (
        <ActionDialog {...common} title={tr('admin.dialogs.unmuteTitle', { name })} confirmLabel={tr('admin.player.unmute')} onConfirm={run(() => api.unmute(p.id, reason))}>
          <ReasonField value={reason} onChange={setReason} />
        </ActionDialog>
      );
    case 'rename':
      return (
        <ActionDialog {...common} title={tr('admin.dialogs.renameTitle')} description={tr('admin.dialogs.renameBody')} confirmLabel={tr('admin.common.save')} disabled={!reason.trim() || username === p.username} onConfirm={run(() => api.rename(p.id, username, reason))}>
          <TextField label={tr('admin.dialogs.newUsername')} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={20} />
          <ReasonField required value={reason} onChange={setReason} />
        </ActionDialog>
      );
    case 'rating':
      return (
        <ActionDialog {...common} title={tr('admin.dialogs.ratingTitle')} description={tr('admin.dialogs.ratingBody')} confirmLabel={tr('admin.common.save')} disabled={!reason.trim() || !d} onConfirm={run(() => api.adjustRating(p.id, pool, d, reason))}>
          <ChoiceField label={tr('admin.dialogs.pool')} value={pool} onChange={setPool} options={POOLS.map((k) => ({ key: k, label: poolLabel(k) }))} />
          <TextField label={tr('admin.dialogs.change')} value={delta} onChangeText={(v) => setDelta(v.replace(/[^\d-]/g, ''))} keyboardType="numbers-and-punctuation" />
          {!!d && <Text variant="numeric">{tr('admin.dialogs.preview', { before: current, after: current + d })}</Text>}
          <ReasonField required value={reason} onChange={setReason} />
        </ActionDialog>
      );
    case 'role':
      return (
        <ActionDialog {...common} title={tr('admin.dialogs.roleTitle')} description={tr('admin.dialogs.roleBody')} confirmLabel={tr('admin.common.save')} disabled={role === p.role} onConfirm={run(() => api.setRole(p.id, role, reason))}>
          <ChoiceField label={tr('admin.player.role')} value={role} onChange={setRole} options={(['user', 'moderator', 'admin'] as const).map((k) => ({ key: k, label: tr(`admin.roles.${k}`) }))} />
          <ReasonField value={reason} onChange={setReason} />
        </ActionDialog>
      );
    case 'signout':
      return (
        <ActionDialog {...common} title={tr('admin.dialogs.signOutTitle', { name })} description={tr('admin.dialogs.signOutBody')} confirmLabel={tr('admin.player.signOut')} danger onConfirm={run(() => api.signOut(p.id, reason))}>
          <ReasonField value={reason} onChange={setReason} />
        </ActionDialog>
      );
    case 'review':
      return (
        <ActionDialog {...common} title={tr('admin.dialogs.reviewTitle')} description={tr('admin.dialogs.reviewBody')} confirmLabel={tr('admin.fairplay.open')} onConfirm={run(() => api.openCase(p.id, reason))}>
          <ReasonField value={reason} onChange={setReason} multiline />
        </ActionDialog>
      );
    case 'close': {
      const reasons = ACCOUNT_CLOSE_REASONS.filter((r) => r !== 'fair_play' || can('fairplay.ban'));
      return (
        <ActionDialog {...common} title={tr('admin.dialogs.closeTitle', { name })} description={tr('admin.dialogs.closeBody')} confirmLabel={tr('admin.player.close')} danger onConfirm={run(() => api.close(p.id, closeReason, reason))}>
          <ChoiceField label={tr('admin.dialogs.closeReason')} value={closeReason} onChange={setCloseReason} options={reasons.map((k) => ({ key: k, label: tr(`admin.closeReasons.${k}`) }))} />
          {closeReason === 'fair_play' && (
            <Text variant="caption" tone="muted">
              {tr('admin.dialogs.closeFairPlayNote')}
            </Text>
          )}
          <ReasonField value={reason} onChange={setReason} multiline />
        </ActionDialog>
      );
    }
    case 'setTitle':
      return (
        <ActionDialog {...common} title={tr('admin.titles.set')} description={tr('admin.titles.setBody')} confirmLabel={tr('admin.common.save')} disabled={!reason.trim() || title === p.title} onConfirm={run(() => api.setTitle(p.id, title, reason))}>
          <ChoiceField label={tr('admin.titles.section')} value={title} onChange={setTitle} options={CHESS_TITLES.map((k) => ({ key: k, label: k }))} />
          <Text variant="caption" tone="muted">
            {tr(`chessTitle.names.${title}`)}
          </Text>
          <ReasonField required label={tr('admin.titles.verification')} value={reason} onChange={setReason} multiline />
        </ActionDialog>
      );
    case 'removeTitle':
      return (
        <ActionDialog {...common} danger title={tr('admin.titles.removeTitle', { title: p.title ?? '', name })} description={tr('admin.titles.removeBody')} confirmLabel={tr('admin.titles.remove')} onConfirm={run(() => api.removeTitle(p.id, revokeReason, reason))}>
          <ChoiceField label={tr('admin.common.reason')} value={revokeReason} onChange={setRevokeReason} options={TITLE_REVOKE_REASONS.map((k) => ({ key: k, label: tr(`admin.titles.revokeReasons.${k}`) }))} />
          <ReasonField value={reason} onChange={setReason} multiline />
        </ActionDialog>
      );
    case 'setTag':
      return (
        <ActionDialog {...common} title={tr('admin.tags.setTitle', { name })} description={tr('admin.tags.setBody')} confirmLabel={tr('admin.common.save')} disabled={tag === p.roleTag} onConfirm={run(() => api.setRoleTag(p.id, tag, reason))}>
          <ChoiceField label={tr('admin.tags.tag')} value={tag} onChange={setTag} options={ROLE_TAGS.map((k) => ({ key: k, label: tr(`chessTitle.roleTags.${k}`) }))} />
          <Row gap="sm">
            <RoleTagBadge tag={tag} size="md" />
          </Row>
          <ReasonField label={tr('admin.tags.note')} value={reason} onChange={setReason} />
        </ActionDialog>
      );
    case 'removeTag':
      return (
        <ActionDialog {...common} danger title={tr('admin.tags.removeTitle', { tag: p.roleTag ? tr(`chessTitle.roleTags.${p.roleTag}`) : '', name })} description={tr('admin.tags.removeBody')} confirmLabel={tr('admin.tags.remove')} onConfirm={run(() => api.setRoleTag(p.id, null, reason))}>
          <ReasonField label={tr('admin.tags.note')} value={reason} onChange={setReason} />
        </ActionDialog>
      );
    case 'reopen':
      return (
        <ActionDialog {...common} title={tr('admin.dialogs.reopenTitle', { name })} description={tr('admin.dialogs.reopenBody')} confirmLabel={tr('admin.player.reopen')} onConfirm={run(() => api.reopen(p.id, reason))}>
          <ReasonField value={reason} onChange={setReason} />
        </ActionDialog>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  c0: { flex: 1.4 },
  cn: { flex: 1, textAlign: 'right' },
});
