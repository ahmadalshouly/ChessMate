import type { StreamerLive } from '@chessmate/core';

/** The platform's own embeddable player for a live stream (muted, starts by itself). */
export function embedUrl(embed: NonNullable<StreamerLive['embed']>, host: string): string {
  const id = encodeURIComponent(embed.id);
  if (embed.platform === 'twitch') return `https://player.twitch.tv/?channel=${id}&parent=${encodeURIComponent(host)}&muted=true&autoplay=true`;
  if (embed.platform === 'youtube') return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1`;
  return `https://player.kick.com/${id}?muted=true&autoplay=true`;
}
