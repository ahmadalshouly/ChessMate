import type { NotificationKind } from '@chessmate/core';

import { formatDate, translate } from '@/i18n';

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return translate('common.time.justNow');
  const m = Math.round(s / 60);
  if (m < 60) return translate('notifications.time.m', { count: m });
  const h = Math.round(m / 60);
  if (h < 24) return translate('notifications.time.h', { count: h });
  const d = Math.round(h / 24);
  if (d < 7) return translate('notifications.time.d', { count: d });
  return formatDate(ts, { month: 'short', day: 'numeric' });
}

/** Text glyph (no emoji presentation, so it stays monochrome) per kind for the monochrome avatar circle. */
export const KIND_GLYPH: Record<NotificationKind, string> = {
  challenge: '♘',
  friend_request: '+',
  friend_accepted: '✓',
  your_turn: '♞',
  review_ready: '★',
  tournament: '♛',
  system: 'i',
};
