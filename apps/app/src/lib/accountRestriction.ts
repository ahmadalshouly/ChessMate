import type { PlayRestriction } from '@chessmate/core';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/lib/auth';
import { usePlay } from '@/lib/playClient';

/**
 * Whether online play is off for the signed-in account (closed for a
 * fair-play violation). The game server's live answer wins; before it has
 * connected, the account record from sign-in decides. When the two disagree
 * (staff just restricted or reopened the account), the account is re-read.
 */
export function useAccountRestriction(): PlayRestriction | null {
  const { user, status, refreshUser } = useAuth();
  const { restriction } = usePlay();
  const fromAccount = status === 'signedIn' && user?.restriction ? { reason: user.restriction.reason } : null;
  const live = status === 'signedIn' ? restriction : null;
  const lastSynced = useRef<boolean | null>(null);

  const accountRestricted = !!fromAccount;
  const liveRestricted = live === undefined ? undefined : !!live;
  useEffect(() => {
    if (liveRestricted === undefined) return;
    if (liveRestricted === accountRestricted) {
      lastSynced.current = null;
      return;
    }
    if (lastSynced.current === liveRestricted) return;
    lastSynced.current = liveRestricted;
    refreshUser().catch(() => {});
  }, [liveRestricted, accountRestricted, refreshUser]);

  return live === undefined ? fromAccount : live;
}
