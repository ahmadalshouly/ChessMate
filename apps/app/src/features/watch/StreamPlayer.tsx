import type { StreamerLive } from '@chessmate/core';

import { StreamPreview } from './StreamPreview';

/** Phones: the stream's preview picture; tapping it opens the stream on its platform. */
export function StreamPlayer({ live, width }: { live: StreamerLive; width: number; title: string }) {
  return <StreamPreview live={live} width={width} />;
}
