import type { NotificationKind } from '@chessmate/core';

/** What a feature hands to `NotificationService.notify`. */
export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body: string;
  url?: string | null;
  data?: Record<string, string>;
  /** Replaces an unread notification with the same key instead of stacking. */
  collapseKey?: string;
}

/*
 * Ready-made notifications for each feature, so wording and deep links stay
 * consistent. Routes are the app's Expo Router paths.
 */

export const challengeReceived = (p: { challengeId: string; fromName: string; timeControl: string; rated: boolean }): NotifyInput => ({
  kind: 'challenge',
  title: 'New challenge',
  body: `${p.fromName} challenges you to a ${p.rated ? 'rated' : 'casual'} ${p.timeControl} game`,
  url: `/challenges?id=${encodeURIComponent(p.challengeId)}`,
  data: { challengeId: p.challengeId },
  collapseKey: `challenge:${p.challengeId}`,
});

export const friendRequest = (p: { fromId: string; fromName: string }): NotifyInput => ({
  kind: 'friend_request',
  title: 'Friend request',
  body: `${p.fromName} wants to be friends`,
  url: '/friends',
  data: { userId: p.fromId },
  collapseKey: `friend:${p.fromId}`,
});

export const friendAccepted = (p: { byId: string; byName: string }): NotifyInput => ({
  kind: 'friend_accepted',
  title: 'Friend request accepted',
  body: `You and ${p.byName} are now friends`,
  url: '/friends',
  data: { userId: p.byId },
});

export const yourTurn = (p: { gameId: string; opponentName: string; san?: string }): NotifyInput => ({
  kind: 'your_turn',
  title: 'Your turn',
  body: p.san ? `${p.opponentName} played ${p.san}` : `${p.opponentName} is waiting for your move`,
  url: `/play/online?game=${encodeURIComponent(p.gameId)}`,
  data: { gameId: p.gameId },
  collapseKey: `turn:${p.gameId}`,
});

export const reviewReady = (p: { gameId: string; opponentName: string; accuracy?: number }): NotifyInput => ({
  kind: 'review_ready',
  title: 'Game review ready',
  body:
    p.accuracy === undefined
      ? `Your coach review of the game against ${p.opponentName} is ready`
      : `Your game against ${p.opponentName}: ${Math.round(p.accuracy)}% accuracy. See where it turned`,
  url: `/review/${encodeURIComponent(p.gameId)}`,
  data: { gameId: p.gameId },
  collapseKey: `review:${p.gameId}`,
});
