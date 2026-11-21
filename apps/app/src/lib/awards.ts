import type { AwardsView } from '@chessmate/core';
import { useCallback, useEffect, useState } from 'react';

import { playClient } from './playClient';
import { apiRequest } from './social/api';

/** A player's awards; `user` is a username or id, null for the signed-in player. */
export async function fetchAwards(user: string | null): Promise<AwardsView> {
  const path = user ? `/api/awards?user=${encodeURIComponent(user)}` : '/api/awards';
  const r = await apiRequest<{ awards: AwardsView }>('GET', path, undefined, { optionalAuth: !!user });
  return r.awards;
}

/** Loads awards and reloads them when the server says new ones were earned. */
export function useAwards(user: string | null, own = user === null) {
  const [data, setData] = useState<AwardsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchAwards(user));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!own) return;
    return playClient.onServerMessage((m) => {
      if (m.t === 'awards') void load();
    });
  }, [own, load]);

  return { data, error, loading, reload: load };
}
