import type { AdCreative } from '@chessmate/core';

import { API_URL } from './config';
import { apiRequest } from './social/api';

const aid = (id: string) => encodeURIComponent(id);

export const adsApi = {
  /** The live sponsor on every switched-on spot. Public: no sign-in needed. */
  list: () => apiRequest<{ ads: AdCreative[] }>('GET', '/api/ads', undefined, { optionalAuth: true }),
  view: (id: string) => apiRequest<{ ok: true }>('POST', `/api/ads/${aid(id)}/view`, {}, { optionalAuth: true }),
  click: (id: string) => apiRequest<{ ok: true }>('POST', `/api/ads/${aid(id)}/click`, {}, { optionalAuth: true }),
};

/** Full URL of an ad image: a server path becomes absolute, an external URL is left alone. */
export function adImageUrl(image: string): string {
  return image.startsWith('/') ? `${API_URL}${image}` : image;
}
