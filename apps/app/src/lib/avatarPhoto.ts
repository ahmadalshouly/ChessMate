import { ACCOUNT_API_URL } from '@/features/account/api';

/**
 * Full address of an uploaded profile picture. The server hands out paths
 * ("/api/avatars/…"), served by the same host as the rest of the API.
 */
export function avatarPhotoUri(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^(https?:|data:|file:|blob:)/.test(path) ? path : `${ACCOUNT_API_URL}${path}`;
}
