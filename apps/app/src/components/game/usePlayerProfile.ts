import type { PlayerInfo, PublicProfile } from '@chessmate/core';
import { useEffect, useState } from 'react';

import { useAccountSession } from '@/features/account/session';

/** Guests and dev logins have no account, so no public profile to look up. */
export const hasProfile = (p: Pick<PlayerInfo, 'id'> | null | undefined): p is PlayerInfo =>
  !!p && !p.id.startsWith('g_') && !p.id.startsWith('bot_');

const cache = new Map<string, Promise<PublicProfile | null>>();

/**
 * Public profile (avatar, country, record) for a player in a game. Looked up
 * once per name (and `refreshKey`, e.g. a game id, to fetch it again) and
 * cached for the session; null for guests and while loading.
 */
export function usePlayerProfile(player: PlayerInfo | null | undefined, refreshKey = ''): PublicProfile | null {
  const session = useAccountSession();
  const name = hasProfile(player) ? player.name : null;
  const key = name ? `${name}|${refreshKey}` : null;
  const [loaded, setLoaded] = useState<{ name: string; profile: PublicProfile | null } | null>(null);

  useEffect(() => {
    if (!name || !key) return;
    let live = true;
    let request = cache.get(key);
    if (!request) {
      request = session.apiFetch<PublicProfile>(`/api/profiles/${encodeURIComponent(name)}`).catch(() => {
        cache.delete(key);
        return null;
      });
      cache.set(key, request);
    }
    void request.then((profile) => live && setLoaded({ name: key, profile }));
    return () => {
      live = false;
    };
  }, [name, key, session]);

  return key && loaded?.name === key ? loaded.profile : null;
}
