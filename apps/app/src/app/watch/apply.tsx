import type { EventApplicationView } from '@chessmate/core';
import { Stack as RouterStack, router } from 'expo-router';
import { useEffect, useState } from 'react';

import { dateRange } from '@/features/watch/components';
import { fromLocalInput } from '@/features/watch/forms';
import { formatAgo, useT } from '@/i18n';
import { useSocialIdentity } from '@/lib/social/session';
import { watchApi } from '@/lib/watchApi';
import { Badge, Button, GlassView, Row, Screen, Stack, Text, TextField, useAppTheme } from '@/ui';

const TONE = { pending: 'warning', approved: 'success', rejected: 'danger' } as const;

/** Ask to broadcast an event on ChessMate; approved organisers manage it themselves. */
export default function ApplyToBroadcast() {
  const tr = useT();
  const t = useAppTheme();
  const me = useSocialIdentity();
  const [mine, setMine] = useState<EventApplicationView[] | null>(null);
  const [f, setF] = useState({ eventName: '', organization: '', website: '', location: '', starts: '', ends: '', description: '', coverage: '' });
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (me) watchApi.myEventApplications().then(setMine, () => setMine([]));
  }, [me?.userId, sent]);

  const submit = async () => {
    const startsAt = fromLocalInput(f.starts);
    const endsAt = fromLocalInput(f.ends);
    if (!startsAt) return setError({ text: tr('watch.apply.dateFormat'), field: 'startsAt' });
    if (!endsAt) return setError({ text: tr('watch.apply.dateFormat'), field: 'endsAt' });
    setBusy(true);
    setError(null);
    try {
      await watchApi.applyEvent({ ...f, website: f.website.trim() || null, startsAt, endsAt: endsAt + 86_399_000 });
      setSent(true);
    } catch (e) {
      const err = e as Error & { field?: string };
      setError({ text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const pending = mine?.some((a) => a.status === 'pending');
  const fieldError = (k: string) => (error?.field === k ? error.text : null);

  return (
    <Screen scroll>
      <RouterStack.Screen options={{ title: tr('watch.apply.title') }} />
      <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
        <Text variant="bodyStrong">{tr('watch.broadcastYours')}</Text>
        <Text tone="muted">{tr('watch.apply.intro')}</Text>
      </GlassView>

      {mine && mine.length > 0 && (
        <Stack gap="sm">
          {mine.map((a) => (
            <GlassView key={a.id} padding="md" radius="lg" style={{ gap: t.space.xs }}>
              <Row justify="space-between" gap="sm">
                <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {a.eventName}
                </Text>
                <Badge label={tr(`watch.applicationStatus.${a.status}`)} tone={TONE[a.status]} />
              </Row>
              <Text variant="caption" tone="muted">
                {[dateRange(a.startsAt, a.endsAt), tr('watch.apply.sentAgo', { when: formatAgo(a.createdAt) })].join(' · ')}
              </Text>
              {a.note ? <Text variant="caption">{a.note}</Text> : null}
              {a.status === 'approved' && a.eventId && <Button title={tr('watch.manage.open')} variant="secondary" size="sm" onPress={() => router.push(`/watch/manage/${a.eventId}`)} />}
            </GlassView>
          ))}
        </Stack>
      )}

      {!me ? (
        <GlassView padding="lg" radius="lg">
          <Text tone="muted">{tr('watch.apply.signIn')}</Text>
        </GlassView>
      ) : sent ? (
        <GlassView padding="lg" radius="lg">
          <Text tone="success">{tr('watch.apply.sent')}</Text>
        </GlassView>
      ) : pending ? null : (
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
          <TextField label={tr('watch.apply.eventName')} value={f.eventName} onChangeText={set('eventName')} maxLength={120} />
          <TextField label={tr('watch.apply.organization')} value={f.organization} onChangeText={set('organization')} maxLength={120} />
          <TextField label={tr('watch.fields.location')} value={f.location} onChangeText={set('location')} maxLength={120} />
          <Row gap="md">
            <TextField containerStyle={{ flex: 1 }} label={tr('watch.apply.starts')} value={f.starts} onChangeText={set('starts')} placeholder="2026-03-14" error={fieldError('startsAt')} />
            <TextField containerStyle={{ flex: 1 }} label={tr('watch.apply.ends')} value={f.ends} onChangeText={set('ends')} placeholder="2026-03-20" error={fieldError('endsAt')} />
          </Row>
          <TextField label={tr('watch.website')} value={f.website} onChangeText={set('website')} autoCapitalize="none" keyboardType="url" placeholder="https://" />
          <TextField label={tr('watch.apply.description')} value={f.description} onChangeText={set('description')} multiline numberOfLines={5} maxLength={2000} helper={tr('watch.apply.descriptionHint')} />
          <TextField label={tr('watch.apply.coverage')} value={f.coverage} onChangeText={set('coverage')} multiline numberOfLines={3} maxLength={500} helper={tr('watch.apply.coverageHint')} />
          {error && !error.field && <Text tone="danger">{error.text}</Text>}
          <Button title={tr('watch.apply.send')} loading={busy} onPress={() => void submit()} />
        </GlassView>
      )}
    </Screen>
  );
}
