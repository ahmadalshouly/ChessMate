import type { TournamentSummary } from '@chessmate/core';

import { formatDateTime, translate } from '@/i18n';

/** "in 2h 5m", "12m 30s left": the next thing that happens to a tournament. */
export function tournamentClock(t: TournamentSummary, now = Date.now()): string {
  const until = (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
  };
  if (t.status === 'scheduled') return translate('tournaments.startsIn', { time: until(t.startsAt - now) });
  if (t.status === 'running') return translate('tournaments.timeLeft', { time: until(t.endsAt - now) });
  if (t.status === 'cancelled') return translate('tournaments.cancelled');
  return translate('tournaments.ended', { date: formatDateTime(t.endsAt) });
}
