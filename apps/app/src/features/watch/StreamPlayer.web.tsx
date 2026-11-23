import type { StreamerLive } from '@chessmate/core';
import { router } from 'expo-router';
import { createElement } from 'react';
import { View } from 'react-native';

import { setCookieConsent, useCookieConsent } from '@/features/privacy/cookieConsent';
import { useT } from '@/i18n';
import { Button, Text } from '@/ui';

import { StreamPreview } from './StreamPreview';
import { embedUrl } from './streamEmbed';

/**
 * Web: the platform's own player, muted, inside the page. Without an embed, the preview picture.
 * The players set the platform's cookies, so they load only with consent for external media
 * (cookie banner, Settings → Privacy); until then the preview picture opens the stream on the platform.
 */
export function StreamPlayer({ live, width, title }: { live: StreamerLive; width: number; title: string }) {
  const tr = useT();
  const consent = useCookieConsent();
  const height = Math.round((width * 9) / 16);
  if (!live.embed || typeof window === 'undefined') return <StreamPreview live={live} width={width} />;
  if (!consent.externalMedia) {
    const platform = tr(`watch.platforms.${live.platform}`);
    return (
      <View style={{ width, gap: 8 }}>
        <StreamPreview live={live} width={width} />
        <Text variant="caption" tone="muted">
          {tr('cookies.embed.notice', { platform })}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button size="sm" variant="secondary" title={tr('cookies.embed.load')} onPress={() => setCookieConsent({ externalMedia: true })} />
          <Button size="sm" variant="ghost" title={tr('cookies.embed.policy')} onPress={() => router.push('/cookies')} />
        </View>
      </View>
    );
  }
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
