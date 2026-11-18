import type { PlayerInfo, PublicProfile } from '@chessmate/core';
import { useEffect, useState } from 'react';

import { useAccountSession } from '@/features/account/session';

/** Guests and dev logins have no account, so no public profile to look up. */
export const hasProfile = (p: Pick<PlayerInfo, 'id'> | null | undefined): p is PlayerInfo =>
  !!p && !p.id.startsWith('g_') && !p.id.startsWith('bot_');

const cache = new Map<string, Promise<PublicProfile | null>>();

/**
 * Public profile (avatar, country, record) for a player in a game. Looked up
 * once per name and cached for the session; null for guests and while loading.
 */
export function usePlayerProfile(player: PlayerInfo | null | undefined): PublicProfile | null {
  const session = useAccountSession();
  const name = hasProfile(player) ? player.name : null;
  const [loaded, setLoaded] = useState<{ name: string; profile: PublicProfile | null } | null>(null);

  useEffect(() => {
    if (!name) return;
    let live = true;
    let request = cache.get(name);
    if (!request) {
      request = session.apiFetch<PublicProfile>(`/api/profiles/${encodeURIComponent(name)}`).catch(() => {
        cache.delete(name);
        return null;
      });
      cache.set(name, request);
    }
    void request.then((profile) => live && setLoaded({ name, profile }));
    return () => {
      live = false;
    };
  }, [name, session]);

  return name && loaded?.name === name ? loaded.profile : null;
}
