import type { PayoutMethod, SponsorApplicationInput, TournamentChatMessage, TournamentDetail, TournamentSummary } from '@chessmate/core';

import { API_URL } from './config';
import { apiRequest } from './social/api';

const tid = (id: string) => encodeURIComponent(id);

export const tournamentsApi = {
  list: () => apiRequest<{ tournaments: TournamentSummary[]; paymentsEnabled: boolean }>('GET', '/api/tournaments', undefined, { optionalAuth: true }),
  get: (id: string) => apiRequest<{ tournament: TournamentDetail; paymentsEnabled: boolean }>('GET', `/api/tournaments/${tid(id)}`, undefined, { optionalAuth: true }),
  join: (id: string) => apiRequest<{ tournament: TournamentDetail }>('POST', `/api/tournaments/${tid(id)}/join`, { acceptRules: true }),
  /** Stripe Checkout for the entry fee (web): returns the payment page. */
  checkout: (id: string, returnUrl: string) => apiRequest<{ url: string }>('POST', `/api/tournaments/${tid(id)}/checkout`, { acceptRules: true, returnUrl }),
  withdraw: (id: string) => apiRequest<{ tournament: TournamentDetail }>('POST', `/api/tournaments/${tid(id)}/withdraw`),
  requestPayout: (id: string, body: { method: PayoutMethod; details: string; note: string | null }) => apiRequest<{ tournament: TournamentDetail }>('POST', `/api/tournaments/${tid(id)}/payout`, body),
  chat: (id: string) => apiRequest<{ messages: TournamentChatMessage[] }>('GET', `/api/tournaments/${tid(id)}/chat`, undefined, { optionalAuth: true }),
  postChat: (id: string, text: string) => apiRequest<{ message: TournamentChatMessage }>('POST', `/api/tournaments/${tid(id)}/chat`, { text }),
  applySponsor: (body: SponsorApplicationInput) => apiRequest<{ ok: true }>('POST', '/api/sponsors', body, { optionalAuth: true }),
};

/** Full URL of a sponsor logo path from the server. */
export const logoUrl = (path: string) => `${API_URL}${path}`;
