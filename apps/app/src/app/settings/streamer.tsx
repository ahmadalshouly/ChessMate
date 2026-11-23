import type { MyStreamerState } from '@chessmate/core';
import { Stack as RouterStack } from 'expo-router';
import { useEffect, useState } from 'react';

import { LiveDot, StreamerCard } from '@/features/watch/components';
import { ChannelEditor, type ChannelDraft } from '@/features/watch/forms';
import { formatAgo, useT } from '@/i18n';
import { watchApi } from '@/lib/watchApi';
import { useSocialIdentity } from '@/lib/social/session';
import { Badge, Button, Chip, GlassView, Row, Screen, Skeleton, Stack, Text, TextField, useAppTheme } from '@/ui';

/** Apply to be a streamer; once approved, edit your channels and go live. */
export default function StreamerSettings() {
  const tr = useT();
  const t = useAppTheme();
  const me = useSocialIdentity();
  const [state, setState] = useState<MyStreamerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Application / profile drafts
  const [channels, setChannels] = useState<ChannelDraft[]>([{ platform: 'twitch', url: '' }]);
  const [about, setAbout] = useState('');
  const [headline, setHeadline] = useState('');
  // Going live
  const [liveTitle, setLiveTitle] = useState('');
  const [liveUrl, setLiveUrl] = useState<string | null>(null);

  const load = async () => {
    try {
      const s = await watchApi.myStreamer();
      setState(s);
      if (s.streamer) {
        setChannels(s.streamer.channels.length ? s.streamer.channels : [{ platform: 'twitch', url: '' }]);
        setHeadline(s.streamer.headline);
        setLiveUrl((u) => u ?? s.streamer!.channels[0]?.url ?? null);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    if (me) void load();
  }, [me?.userId]);

  const run = async (f: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await f();
      await load();
      if (done) setNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const cleanChannels = () => channels.filter((c) => c.url.trim()).map((c) => ({ platform: c.platform, url: c.url.trim() }));

  if (!me) {
    return (
      <Screen scroll>
        <RouterStack.Screen options={{ title: tr('watch.streamer.title') }} />
        <GlassView padding="lg" radius="lg">
          <Text tone="muted">{tr('watch.streamer.signIn')}</Text>
        </GlassView>
      </Screen>
    );
  }

  const s = state?.streamer;
  const app = state?.application;
  return (
    <Screen scroll>
      <RouterStack.Screen options={{ title: tr('watch.streamer.title') }} />
      {!state && !error && <Skeleton height={160} radius="lg" />}
      {error && (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      {notice && <Text tone="success">{notice}</Text>}

      {s ? (
        <>
          <StreamerCard s={s} />
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
            {s.live ? (
              <>
                <Row gap="xs">
                  <LiveDot />
                  <Text variant="bodyStrong">{tr('watch.streamer.liveSince', { when: formatAgo(s.live.since) })}</Text>
                </Row>
                <Text tone="muted">{s.live.title}</Text>
                {s.live.viewers !== null ? <Text variant="caption">{tr('watch.viewers', { count: s.live.viewers })}</Text> : null}
                {s.live.auto ? (
                  // Found on the platform: it ends by itself when the stream stops.
                  <Text variant="caption" tone="muted">
                    {tr('watch.streamer.autoFound')}
                  </Text>
                ) : (
                  <Button title={tr('watch.streamer.endLive')} variant="danger" loading={busy} onPress={() => void run(() => watchApi.endLive())} />
                )}
              </>
            ) : (
              <>
                <Text variant="bodyStrong">{tr('watch.streamer.autoTitle')}</Text>
                <Text variant="caption" tone="muted">
                  {tr('watch.streamer.autoHint')}
                </Text>
                <Text variant="bodyStrong">{tr('watch.streamer.goLiveTitle')}</Text>
                <Text variant="caption" tone="muted">
                  {tr('watch.streamer.goLiveHint')}
                </Text>
                <TextField label={tr('watch.streamer.streamTitle')} value={liveTitle} onChangeText={setLiveTitle} maxLength={120} placeholder={tr('watch.streamer.streamTitlePlaceholder')} />
                <Row gap="xs" wrap>
                  {s.channels.map((c) => (
                    <Chip key={c.url} label={tr(`watch.platforms.${c.platform}`)} selected={liveUrl === c.url} onPress={() => setLiveUrl(c.url)} />
                  ))}
                </Row>
                <Button title={tr('watch.streamer.goLive')} loading={busy} onPress={() => void run(() => watchApi.goLive({ title: liveTitle.trim(), url: liveUrl ?? undefined }), tr('watch.streamer.youAreLive'))} />
              </>
            )}
          </GlassView>
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
            <Text variant="bodyStrong">{tr('watch.streamer.profile')}</Text>
            <TextField label={tr('watch.streamer.headline')} value={headline} onChangeText={setHeadline} maxLength={120} placeholder={tr('watch.streamer.headlinePlaceholder')} />
            <ChannelEditor value={channels} onChange={setChannels} />
            <Button title={tr('watch.save')} variant="secondary" loading={busy} onPress={() => void run(() => watchApi.updateStreamer({ headline: headline.trim(), channels: cleanChannels() }), tr('watch.streamer.saved'))} />
          </GlassView>
        </>
      ) : app?.status === 'pending' ? (
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
          <Badge label={tr('watch.applicationStatus.pending')} tone="warning" />
          <Text>{tr('watch.streamer.pending', { when: formatAgo(app.createdAt) })}</Text>
        </GlassView>
      ) : (
        state && (
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
            <Text variant="bodyStrong">{tr('watch.streamer.applyTitle')}</Text>
            <Text variant="caption" tone="muted">
              {tr('watch.streamer.applyIntro')}
            </Text>
            {app?.status === 'rejected' && (
              <Text tone="warning">{app.note ? tr('watch.streamer.rejectedNote', { note: app.note }) : tr('watch.streamer.rejected')}</Text>
            )}
            <ChannelEditor value={channels} onChange={setChannels} />
            <TextField label={tr('watch.streamer.about')} value={about} onChangeText={setAbout} multiline numberOfLines={4} maxLength={1000} placeholder={tr('watch.streamer.aboutPlaceholder')} />
            <Button title={tr('watch.streamer.apply')} loading={busy} disabled={!state.canApply} onPress={() => void run(() => watchApi.applyStreamer({ channels: cleanChannels(), about: about.trim() }), tr('watch.streamer.sent'))} />
          </GlassView>
        )
      )}
    </Screen>
  );
}
