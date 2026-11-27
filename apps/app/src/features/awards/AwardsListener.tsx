import { useEffect } from 'react';

import { playClient } from '@/lib/playClient';

import { AwardDropBanner } from './AwardDropBanner';
import { dropAwards } from './drops';
import { useProbe } from '@/lib/heatProbe';

/** Drops a banner from the top when a finished game unlocks awards, on any screen. */
export function AwardsListener() {
  useProbe('AwardsListener');
  useEffect(
    () =>
      playClient.onServerMessage((m) => {
        if (m.t === 'awards') dropAwards(m.earned);
      }),
    [],
  );
  return <AwardDropBanner />;
}
