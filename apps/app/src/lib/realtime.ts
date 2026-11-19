import type { Presence, SocialEvent } from '@chessmate/core';
import { useEffect, useRef } from 'react';

import { playClient } from './playClient';

/**
 * Live updates from the server, over the one socket the app keeps open while
 * signed in (see the root layout). Screens use these to refresh the moment
 * something changes instead of waiting for a reload.
 */
export function onSocialEvent(fn: (e: SocialEvent) => void): () => void {
  return playClient.onServerMessage((m) => {
    if (m.t === 'social') fn(m.event);
  });
}

/**
 * Calls `refresh` when a social event arrives (friend request, acceptance,
 * removal, message). `kinds` limits it to some events.
 */
export function useSocialRefresh(refresh: () => void, kinds?: SocialEvent['kind'][]) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });
  const key = kinds?.join(',') ?? '';
  useEffect(
    () =>
      onSocialEvent((e) => {
        if (!key || key.split(',').includes(e.kind)) latest.current();
      }),
    [key],
  );
}

/** A friend went online, offline, or started or finished a game. */
export function onPresence(fn: (userId: string, presence: Presence) => void): () => void {
  return playClient.onServerMessage((m) => {
    if (m.t === 'presence') fn(m.userId, m.presence);
  });
}
