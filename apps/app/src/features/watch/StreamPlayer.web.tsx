import type { StreamerLive } from '@chessmate/core';
import { createElement } from 'react';
import { View } from 'react-native';

import { StreamPreview } from './StreamPreview';
import { embedUrl } from './streamEmbed';

/** Web: the platform's own player, muted, inside the page. Without an embed, the preview picture. */
export function StreamPlayer({ live, width, title }: { live: StreamerLive; width: number; title: string }) {
  const height = Math.round((width * 9) / 16);
  if (!live.embed || typeof window === 'undefined') return <StreamPreview live={live} width={width} />;
  return (
    <View style={{ width, height, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
      {createElement('iframe', {
        src: embedUrl(live.embed, window.location.hostname),
        title,
        allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media',
        allowFullScreen: true,
        referrerPolicy: 'strict-origin-when-cross-origin',
        style: { width: '100%', height: '100%', border: 0, display: 'block' },
      })}
    </View>
  );
}
