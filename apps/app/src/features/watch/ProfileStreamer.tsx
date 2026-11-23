import type { StreamerView } from '@chessmate/core';
import { useEffect, useState } from 'react';

import { useT } from '@/i18n';
import { watchApi } from '@/lib/watchApi';
import { SectionHeader, Stack } from '@/ui';

import { StreamerCard } from './components';

/** On a profile: the player's stream channels and whether they are live, when they are a streamer. */
export function ProfileStreamer({ userId }: { userId: string }) {
  const tr = useT();
  const [s, setS] = useState<StreamerView | null>(null);
  useEffect(() => {
    let alive = true;
    watchApi.streamer(userId).then((v) => alive && setS(v), () => {});
    return () => {
      alive = false;
    };
  }, [userId]);
  if (!s) return null;
  return (
    <Stack gap="sm">
      <SectionHeader title={tr('watch.streamer.onProfile')} />
      <StreamerCard s={s} />
    </Stack>
  );
}
