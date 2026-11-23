import { useEffect, useSyncExternalStore } from 'react';
import type { MyProfile } from '@chessmate/core';

import { request } from '@/features/account/api';
import { useAuth } from '@/lib/auth';

/**
 * The signed-in player's own profile picture, for the header and sidebar.
 * Loaded once per account, and updated in place when the player uploads or
 * removes a picture or opens their profile.
 */
type State = { userId: string | null; photo: string | null };
let state: State = { userId: null, photo: null };
let loading: string | null = null;
const listeners = new Set<() => void>();

export function setMyPhoto(userId: string, photo: string | null | undefined) {
  if (state.userId === userId && state.photo === (photo ?? null)) return;
  state = { userId, photo: photo ?? null };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Path of the player's uploaded picture (see avatarPhotoUri), or null. */
export function useMyPhoto(): string | null {
  const { status, user, getAccessToken } = useAuth();
  const snap = useSyncExternalStore(subscribe, () => state, () => state);
  const userId = status === 'signedIn' ? (user?.id ?? null) : null;
  useEffect(() => {
    if (!userId || state.userId === userId || loading === userId) return;
    loading = userId;
    void getAccessToken()
      .then((token) => request<MyProfile>('/api/me/profile', token))
      .then((p) => setMyPhoto(userId, p.avatar.photo))
      .catch(() => {})
      .finally(() => {
        if (loading === userId) loading = null;
      });
  }, [userId, getAccessToken]);
  return userId && snap.userId === userId ? snap.photo : null;
}
