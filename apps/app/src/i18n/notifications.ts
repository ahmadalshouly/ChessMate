import type { AppNotification } from '@chessmate/core';

import { translate } from './index';

/**
 * In-app notifications arrive with English title/body from the server templates
 * (apps/server/src/notifications/templates.ts). This turns the known ones into the
 * player's language; anything unrecognised is shown as sent. Keep the patterns in
 * sync with the server templates.
 */
const BODY: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(.+) challenges you to a (rated|casual) (\S+) game$/, (m) => translate(m[2] === 'rated' ? 'notifications.body.challengeRated' : 'notifications.body.challengeCasual', { name: m[1]!, tc: m[3]! })],
  [/^(.+) wants to be friends$/, (m) => translate('notifications.body.friendRequest', { name: m[1]! })],
  [/^You and (.+) are now friends$/, (m) => translate('friends.feed.friendsSubject', { b: m[1]! })],
  [/^(.+) played (\S+)$/, (m) => translate('notifications.body.played', { name: m[1]!, san: m[2]! })],
  [/^(.+) is waiting for your move$/, (m) => translate('notifications.body.waiting', { name: m[1]! })],
  [/^Your review of the game against (.+) is ready$/, (m) => translate('notifications.body.reviewReady', { name: m[1]! })],
  [/^Your game against (.+): (\d+)% accuracy\. See where it turned$/, (m) => translate('notifications.body.reviewAccuracy', { name: m[1]!, accuracy: m[2]! })],
  [/^Notifications are working on this device\.$/, () => translate('notifications.body.test')],
  // Moderation notices (apps/server/src/admin/notices.ts).
  [/^Our fair play review found outside help in your games\./, () => translate('notifications.body.fairPlay')],
  [/^Your account is open again\. Online play is back on\.$/, () => translate('notifications.body.reopened')],
  [
    /^We gave you back ([\d.]+) rating points from (\d+) games?\. An account you played broke our fair play rules\.$/,
    (m) => translate('notifications.body.ratingRefund', { points: m[1]!, count: Number(m[2]) }),
  ],
  [/^Chat is off for your account for (\d+) (hours?|days)\. Reason: (.*)$/s, (m) => translate(m[2] === 'days' ? 'notifications.body.mutedDays' : 'notifications.body.mutedHours', { count: Number(m[1]), reason: m[3]! })],
];

const TITLE: Record<string, Parameters<typeof translate>[0]> = {
  'New challenge': 'notifications.title.challenge',
  'Friend request': 'notifications.title.friendRequest',
  'Friend request accepted': 'notifications.title.friendAccepted',
  'Your turn': 'notifications.title.yourTurn',
  'Game review ready': 'notifications.title.reviewReady',
  'Test notification': 'notifications.title.test',
  'Warning from ChessMate moderators': 'notifications.title.warning',
  'Chat turned off': 'notifications.title.muted',
  'Account closed for fair play': 'notifications.title.fairPlay',
  'Account reopened': 'notifications.title.reopened',
  'Rating points returned': 'notifications.title.ratingRefund',
};

export function notificationText(n: Pick<AppNotification, 'title' | 'body'>): { title: string; body: string } {
  const titleKey = TITLE[n.title];
  let body = n.body;
  for (const [re, fn] of BODY) {
    const m = n.body.match(re);
    if (m) {
      body = fn(m);
      break;
    }
  }
  return { title: titleKey ? translate(titleKey) : n.title, body };
}
