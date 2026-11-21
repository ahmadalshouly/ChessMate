/**
 * Notification model shared by the server (store, push) and the app
 * (notification center, settings). Kept separate from the WebSocket
 * protocol so the HTTP API and push payloads can use it too.
 */

export const NOTIFICATION_KINDS = ['challenge', 'friend_request', 'friend_accepted', 'your_turn', 'review_ready', 'message', 'tournament', 'system'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app route to open on tap, e.g. "/play/online?game=ab12cd34". */
  url: string | null;
  /** Small structured payload (game id, sender id...) for the client. */
  data: Record<string, string>;
  createdAt: number;
  readAt: number | null;
}

export interface ChannelPrefs {
  inApp: boolean;
  push: boolean;
}

export interface NotificationPrefs {
  kinds: Record<NotificationKind, ChannelPrefs>;
  /** Quiet hours in the user's local time (minutes after midnight); push is held back, in-app still arrives. */
  quietHours: { enabled: boolean; startMin: number; endMin: number; tzOffsetMin: number };
}

export const NOTIFICATION_KIND_INFO: Record<NotificationKind, { label: string; description: string; userConfigurable: boolean }> = {
  challenge: { label: 'Challenges', description: 'Someone challenges you to a game', userConfigurable: true },
  friend_request: { label: 'Friend requests', description: 'Someone wants to add you as a friend', userConfigurable: true },
  friend_accepted: { label: 'Friend accepted', description: 'Someone accepted your friend request', userConfigurable: true },
  your_turn: { label: 'Your turn', description: 'Your opponent moved while you were away', userConfigurable: true },
  review_ready: { label: 'Game review ready', description: 'The coach finished reviewing your game', userConfigurable: true },
  message: { label: 'Messages', description: 'Someone sends you a message', userConfigurable: true },
  tournament: { label: 'Tournaments', description: 'A tournament you joined is starting', userConfigurable: true },
  system: { label: 'Account and security', description: 'Important account messages', userConfigurable: false },
};

export function defaultNotificationPrefs(): NotificationPrefs {
  const kinds = {} as Record<NotificationKind, ChannelPrefs>;
  for (const k of NOTIFICATION_KINDS) kinds[k] = { inApp: true, push: true };
  return { kinds, quietHours: { enabled: false, startMin: 22 * 60, endMin: 7 * 60, tzOffsetMin: 0 } };
}

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isMinute = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1440;

/**
 * Merges an untrusted partial update into existing preferences. Unknown keys
 * are ignored, and kinds that are not user-configurable stay on.
 */
export function mergeNotificationPrefs(base: NotificationPrefs, patch: unknown): NotificationPrefs {
  const next: NotificationPrefs = {
    kinds: { ...base.kinds },
    quietHours: { ...base.quietHours },
  };
  if (!patch || typeof patch !== 'object') return next;
  const p = patch as { kinds?: unknown; quietHours?: unknown };
  if (p.kinds && typeof p.kinds === 'object') {
    for (const k of NOTIFICATION_KINDS) {
      const c = (p.kinds as Record<string, unknown>)[k];
      if (!c || typeof c !== 'object' || !NOTIFICATION_KIND_INFO[k].userConfigurable) continue;
      const { inApp, push } = c as Record<string, unknown>;
      next.kinds[k] = { inApp: isBool(inApp) ? inApp : next.kinds[k].inApp, push: isBool(push) ? push : next.kinds[k].push };
    }
  }
  if (p.quietHours && typeof p.quietHours === 'object') {
    const q = p.quietHours as Record<string, unknown>;
    if (isBool(q.enabled)) next.quietHours.enabled = q.enabled;
    if (isMinute(q.startMin)) next.quietHours.startMin = q.startMin;
    if (isMinute(q.endMin)) next.quietHours.endMin = q.endMin;
    if (typeof q.tzOffsetMin === 'number' && Number.isInteger(q.tzOffsetMin) && Math.abs(q.tzOffsetMin) <= 14 * 60) {
      next.quietHours.tzOffsetMin = q.tzOffsetMin;
    }
  }
  return next;
}

/** True when `now` falls inside the user's quiet hours (window may wrap midnight). */
export function inQuietHours(q: NotificationPrefs['quietHours'], now: number): boolean {
  if (!q.enabled || q.startMin === q.endMin) return false;
  const local = new Date(now + q.tzOffsetMin * 60_000);
  const m = local.getUTCHours() * 60 + local.getUTCMinutes();
  return q.startMin < q.endMin ? m >= q.startMin && m < q.endMin : m >= q.startMin || m < q.endMin;
}
