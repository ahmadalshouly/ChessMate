import type { NotificationKind } from '@chessmate/core';

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Text glyph (no emoji presentation, so it stays monochrome) per kind for the monochrome avatar circle. */
export const KIND_GLYPH: Record<NotificationKind, string> = {
  challenge: '♘',
  friend_request: '+',
  friend_accepted: '✓',
  your_turn: '♞',
  review_ready: '★',
  system: 'i',
};
