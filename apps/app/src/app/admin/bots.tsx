import {
  BOT_BANDS,
  BOT_RATING_MAX,
  BOT_RATING_MIN,
  BOT_STYLES,
  ONLINE_BOT_LIMITS,
  ONLINE_BOT_TAGS,
  botBandOf,
  type BotStyle,
  type OnlineBotTag,
  type OnlineBotView,
} from '@chessmate/core';
import { useState } from 'react';
import { View } from 'react-native';

import { Segmented } from '@/components/play/Controls';
import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { BotAvatar } from '@/features/bots/BotAvatar';
import { formatDateTime, formatNumber, useT } from '@/i18n';
import type { OnlineBotForm } from '@/lib/adminApi';
import { botAvatarUrl } from '@/lib/botsApi';
import { PICTURE_MAX_CHARS, pickPicture } from '@/lib/pickLogo';
import { Badge, Button, GlassView, Row, Stack, Switch, Text, TextField, useToast } from '@/ui';

type Form = {
  name: string;
  tagline: string;
  /** As typed; checked on save. */
  rating: string;
  style: BotStyle;
  tag: OnlineBotTag | 'none';
  url: string;
  imageUrl: string;
  /** A newly picked picture as a data URL, null to remove it; undefined keeps the stored one. */
  image?: string | null;
  featured: boolean;
  enabled: boolean;
};

const BLANK: Form = { name: '', tagline: '', rating: '1500', style: 'balanced', tag: 'streamer', url: '', imageUrl: '', featured: true, enabled: true };

function formOf(b: OnlineBotView): Form {
  return {
    name: b.name,
    tagline: b.tagline ?? '',
    rating: String(b.rating),
    style: b.style,
    tag: b.tag ?? 'none',
    url: b.url ?? '',
    imageUrl: b.imageUrl ?? '',
    featured: b.featured,
    enabled: b.enabled,
  };
}

/** The form's fields as the server wants them. */
function toBody(f: Form): OnlineBotForm {
  return {
    name: f.name,
    tagline: f.tagline || null,
    rating: Number(f.rating),
    style: f.style,
    tag: f.tag === 'none' ? null : f.tag,
    url: f.url || null,
    imageUrl: f.imageUrl || null,
    ...(f.image !== undefined ? { image: f.image } : {}),
    featured: f.featured,
    enabled: f.enabled,
  };
}

const ratingOk = (r: string) => /^\d+$/.test(r.trim()) && Number(r) >= BOT_RATING_MIN && Number(r) <= BOT_RATING_MAX;

/**
 * Online bots: computer opponents with their own name, picture, rating, style
 * and link, such as a bot in a streamer's name. They show in the app's
 * opponent picker while players are online (featured ones in a row at the top)
 * and play on the player's device like a built-in bot of the same rating.
 */
export default function AdminBots() {
  const tr = useT();
  const { api } = useAdmin();
  const { data, error, loading, reload } = useLoad(() => api.bots(), [api]);
  const [adding, setAdding] = useState(false);

  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader
        title={tr('admin.nav.bots')}
        subtitle={tr('admin.bots.subtitle')}
        right={adding ? undefined : <Button size="sm" title={tr('admin.bots.add')} onPress={() => setAdding(true)} />}
      />
      <ErrorLine message={error} />

      {adding && (
        <Section title={tr('admin.bots.newTitle')}>
          <BotForm
            initial={BLANK}
            onCancel={() => setAdding(false)}
            onSave={async (f) => {
              await api.createBot(toBody(f));
              setAdding(false);
              reload();
            }}
          />
        </Section>
      )}

      <Section title={tr('admin.bots.list')} padding="none">
        {data && data.length === 0 ? (
          <EmptyState icon="hardware-chip-outline" title={tr('admin.bots.empty')} body={tr('admin.bots.emptyBody')} />
        ) : (
          <Stack gap="md">
            {data?.map((b) => <BotRow key={b.id} b={b} onDone={reload} />)}
          </Stack>
        )}
      </Section>
    </AdminPage>
  );
}

function BotRow({ b, onDone }: { b: OnlineBotView; onDone: () => void }) {
  const tr = useT();
  const { api } = useAdmin();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const avatar = botAvatarUrl(b.imagePath ?? b.imageUrl);

  const act = async (fn: () => Promise<unknown>, done = true) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast.show({ title: tr('admin.common.done'), tone: 'success' });
      onDone();
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const played = b.games ? tr('admin.bots.played', { games: formatNumber(b.games), wins: formatNumber(b.playerWins), losses: formatNumber(b.botWins), draws: formatNumber(b.draws) }) : tr('admin.bots.notPlayed');

  return (
    <GlassView radius="lg" padding="lg" flat>
      <Stack gap="sm">
        <Row justify="space-between" gap="md" wrap>
          <Row gap="md" align="center" style={{ flexShrink: 1, minWidth: 200 }}>
            <BotAvatar bot={{ name: b.name, initial: (b.name[0] ?? '?').toUpperCase(), rating: b.rating, avatar }} size={48} />
            <Stack gap="xxs" style={{ flexShrink: 1 }}>
              <Text variant="subheading">{b.name}</Text>
              <Text variant="caption" tone="muted">
                {tr('admin.bots.meta', { rating: b.rating, band: tr(`bots.bands.${botBandOf(b.rating)}`), style: tr(`bots.styles.${b.style}`) })}
              </Text>
            </Stack>
          </Row>
          <Row gap="xs" wrap align="center">
            {b.tag ? <Badge label={tr(`chessTitle.roleTags.${b.tag}`)} tone="outline" /> : null}
            {b.featured ? <Badge label={tr('admin.bots.featuredBadge')} tone="solid" /> : null}
            <Badge label={b.enabled ? tr('admin.bots.on') : tr('admin.bots.off')} tone={b.enabled ? 'success' : 'danger'} />
          </Row>
        </Row>
        {b.tagline ? (
          <Text variant="caption" tone="muted">
            {b.tagline}
          </Text>
        ) : null}
        {b.url ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {b.url}
          </Text>
        ) : null}
        <Text variant="caption" tone="tertiary">
          {played}
        </Text>

        {editing ? (
          <BotForm
            initial={formOf(b)}
            preview={avatar}
            onCancel={() => setEditing(false)}
            onSave={async (f) => {
              await api.saveBot(b.id, toBody(f));
              setEditing(false);
              onDone();
            }}
          />
        ) : (
          <Row gap="sm" wrap align="center">
            <Row gap="xs" align="center">
              <Switch value={b.enabled} disabled={busy} onValueChange={(v) => void act(() => api.setBotFlags(b.id, { enabled: v }), false)} accessibilityLabel={tr('admin.bots.enabled')} />
              <Text variant="caption">{tr('admin.bots.enabled')}</Text>
            </Row>
            <Row gap="xs" align="center">
              <Switch value={b.featured} disabled={busy} onValueChange={(v) => void act(() => api.setBotFlags(b.id, { featured: v }), false)} accessibilityLabel={tr('admin.bots.featured')} />
              <Text variant="caption">{tr('admin.bots.featured')}</Text>
            </Row>
            <Button size="sm" variant="secondary" title={tr('admin.bots.edit')} onPress={() => setEditing(true)} />
            {confirmDelete ? (
              <Row gap="sm">
                <Button size="sm" variant="danger" loading={busy} title={tr('admin.bots.deleteConfirm')} onPress={() => void act(() => api.deleteBot(b.id))} />
                <Button size="sm" variant="ghost" title={tr('common.cancel')} onPress={() => setConfirmDelete(false)} />
              </Row>
            ) : (
              <Button size="sm" variant="ghost" title={tr('admin.bots.delete')} onPress={() => setConfirmDelete(true)} />
            )}
          </Row>
        )}
        <Text variant="caption" tone="tertiary">
          {tr('admin.bots.created', { name: b.createdBy ?? '—', date: formatDateTime(b.createdAt) })}
        </Text>
      </Stack>
    </GlassView>
  );
}

function BotForm({ initial, preview: stored, onSave, onCancel }: { initial: Form; preview?: string | null; onSave: (f: Form) => Promise<void>; onCancel: () => void }) {
  const tr = useT();
  const toast = useToast();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const preview = f.image === null ? null : (picked ?? stored ?? (f.imageUrl.trim() || null));
  const band = ratingOk(f.rating) ? BOT_BANDS.find((b) => b.id === botBandOf(Number(f.rating))) : undefined;

  const pick = async () => {
    try {
      const data = await pickPicture();
      if (!data) return;
      if (data.length > PICTURE_MAX_CHARS) return toast.show({ title: tr('admin.bots.imageTooBig'), tone: 'danger' });
      setF((x) => ({ ...x, image: data }));
      setPicked(data);
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
      <TextField label={tr('admin.bots.name')} value={f.name} onChangeText={set('name')} maxLength={ONLINE_BOT_LIMITS.nameMax} placeholder={tr('admin.bots.nameHint')} />
      <TextField label={tr('admin.bots.tagline')} value={f.tagline} onChangeText={set('tagline')} maxLength={ONLINE_BOT_LIMITS.taglineMax} placeholder={tr('admin.bots.taglineHint')} multiline />
      <TextField
        label={tr('admin.bots.rating')}
        value={f.rating}
        onChangeText={(v) => set('rating')(v.replace(/[^\d]/g, '').slice(0, 4))}
        keyboardType="number-pad"
        helper={band ? tr('admin.bots.ratingBand', { band: tr(`bots.bands.${band.id}`) }) : tr('admin.bots.ratingRange', { min: BOT_RATING_MIN, max: BOT_RATING_MAX })}
        error={f.rating && !ratingOk(f.rating) ? tr('admin.bots.ratingRange', { min: BOT_RATING_MIN, max: BOT_RATING_MAX }) : null}
      />
      <Stack gap="xs">
        <Text variant="overline" tone="muted">
          {tr('admin.bots.style')}
        </Text>
        <Segmented<BotStyle> size="sm" value={f.style} onChange={set('style')} options={BOT_STYLES.map((s) => ({ value: s, label: tr(`bots.styles.${s}`) }))} />
        <Text variant="caption" tone="tertiary">
          {tr(`bots.styleHint.${f.style}`)}
        </Text>
      </Stack>
      <Stack gap="xs">
        <Text variant="overline" tone="muted">
          {tr('admin.bots.badge')}
        </Text>
        <Segmented<OnlineBotTag | 'none'>
          size="sm"
          value={f.tag}
          onChange={set('tag')}
          options={[...ONLINE_BOT_TAGS.map((t) => ({ value: t, label: tr(`chessTitle.roleTags.${t}`) })), { value: 'none' as const, label: tr('admin.bots.noBadge') }]}
        />
      </Stack>
      <TextField label={tr('admin.bots.url')} value={f.url} onChangeText={set('url')} autoCapitalize="none" placeholder="https://twitch.tv/..." maxLength={ONLINE_BOT_LIMITS.urlMax} />
      <Row gap="md" align="center" wrap>
        <BotAvatar bot={{ name: f.name || '?', initial: (f.name.trim()[0] ?? '?').toUpperCase(), rating: ratingOk(f.rating) ? Number(f.rating) : 1500, avatar: botAvatarUrl(preview) }} size={56} />
        <Button size="sm" variant="secondary" title={tr('admin.bots.pickImage')} onPress={() => void pick()} />
        {preview ? <Button size="sm" variant="ghost" title={tr('admin.bots.clearImage')} onPress={() => (setF((x) => ({ ...x, image: null, imageUrl: '' })), setPicked(null))} /> : null}
      </Row>
      <TextField label={tr('admin.bots.imageUrl')} value={f.imageUrl} onChangeText={set('imageUrl')} autoCapitalize="none" placeholder="https://" maxLength={ONLINE_BOT_LIMITS.urlMax} />
      <Row gap="lg" wrap>
        <Row gap="xs" align="center">
          <Switch value={f.enabled} onValueChange={set('enabled')} accessibilityLabel={tr('admin.bots.enabled')} />
          <Text variant="caption">{tr('admin.bots.enabled')}</Text>
        </Row>
        <Row gap="xs" align="center">
          <Switch value={f.featured} onValueChange={set('featured')} accessibilityLabel={tr('admin.bots.featured')} />
          <Text variant="caption">{tr('admin.bots.featured')}</Text>
        </Row>
      </Row>
      <Text variant="caption" tone="tertiary">
        {tr('admin.bots.howItPlays')}
      </Text>
      <Row gap="sm" wrap>
        <Button size="sm" title={tr('admin.common.save')} loading={busy} disabled={f.name.trim().length < 2 || !ratingOk(f.rating)} onPress={() => void save()} />
        <Button size="sm" variant="ghost" title={tr('common.cancel')} onPress={onCancel} />
      </Row>
      <View />
    </Stack>
  );
}
