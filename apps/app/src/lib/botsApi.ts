import type { BotGameResult, OnlineBot } from '@chessmate/core';

import { API_URL } from './config';
import { apiRequest } from './social/api';

const bid = (id: string) => encodeURIComponent(id);

export const botsApi = {
  /** The online computer opponents staff have switched on. Public: no sign-in needed. */
  list: () => apiRequest<{ bots: OnlineBot[] }>('GET', '/api/bots', undefined, { optionalAuth: true }),
  /** Counts one finished game against an online bot (how it went for the player). */
  result: (id: string, result: BotGameResult) => apiRequest<{ ok: true }>('POST', `/api/bots/${bid(id)}/result`, { result }, { optionalAuth: true }),
};

/** Full URL of a bot's picture: a server path becomes absolute, an external URL is left alone. */
export function botAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  return avatar.startsWith('/') ? `${API_URL}${avatar}` : avatar;
}
