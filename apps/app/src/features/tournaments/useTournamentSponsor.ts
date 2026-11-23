import type { TournamentSponsor } from '@chessmate/core';
import { useEffect, useState } from 'react';

import { tournamentsApi } from '@/lib/tournamentsApi';

const cache = new Map<string, TournamentSponsor | null>();

/** The sponsor of a tournament (cached), for showing it on tournament games. */
export function useTournamentSponsor(tournamentId: string | null): TournamentSponsor | null {
  const [sponsor, setSponsor] = useState<TournamentSponsor | null>(tournamentId ? (cache.get(tournamentId) ?? null) : null);
  useEffect(() => {
    if (!tournamentId) return setSponsor(null);
    if (cache.has(tournamentId)) return setSponsor(cache.get(tournamentId) ?? null);
    let live = true;
    tournamentsApi.get(tournamentId).then(
      (r) => {
        cache.set(tournamentId, r.tournament.sponsor);
        if (live) setSponsor(r.tournament.sponsor);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [tournamentId]);
  return sponsor;
}
