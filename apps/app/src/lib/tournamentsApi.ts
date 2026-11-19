import type { TournamentDetail, TournamentSummary } from '@chessmate/core';

import { apiRequest } from './social/api';

export const tournamentsApi = {
  list: () => apiRequest<{ tournaments: TournamentSummary[] }>('GET', '/api/tournaments', undefined, { optionalAuth: true }),
  get: (id: string) => apiRequest<{ tournament: TournamentDetail }>('GET', `/api/tournaments/${encodeURIComponent(id)}`, undefined, { optionalAuth: true }),
  join: (id: string) => apiRequest<{ tournament: TournamentDetail }>('POST', `/api/tournaments/${encodeURIComponent(id)}/join`),
  withdraw: (id: string) => apiRequest<{ tournament: TournamentDetail }>('POST', `/api/tournaments/${encodeURIComponent(id)}/withdraw`),
};
