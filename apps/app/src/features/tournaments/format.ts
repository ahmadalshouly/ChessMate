import { DEFAULT_TOURNAMENT_SETTINGS, type TournamentSettings, type TournamentSummary } from '@chessmate/core';

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
  if (t.status === 'running') {
    if (t.finishing || t.endsAt <= now) return translate('tournaments.finishing');
    const left = translate('tournaments.timeLeft', { time: until(t.endsAt - now) });
    const s = settingsOf(t);
    return s.format === 'swiss' && t.round > 0 ? `${translate('tournaments.round', { n: t.round, total: s.rounds })} · ${left}` : left;
  }
  if (t.status === 'cancelled') return translate('tournaments.cancelled');
  return translate('tournaments.ended', { date: formatDateTime(t.endsAt) });
}

export const settingsOf = (t: Pick<TournamentSummary, 'settings'>): TournamentSettings => t.settings ?? DEFAULT_TOURNAMENT_SETTINGS;

/** "Arena" or "Swiss · 7 rounds". */
export function formatLabel(t: Pick<TournamentSummary, 'settings'>): string {
  const s = settingsOf(t);
  return s.format === 'swiss'
    ? `${translate('tournaments.format.swiss')} · ${translate('tournaments.format.rounds', { count: s.rounds })}`
    : translate('tournaments.format.arena');
}

/** Swiss half points: 2.5 → "2½". */
export function formatScore(score: number): string {
  const whole = Math.floor(score);
  return score - whole >= 0.5 ? `${whole === 0 ? '' : whole}½` : String(whole);
}

/** How this tournament is played and scored, one rule per line. */
export function scoringRules(t: Pick<TournamentSummary, 'settings'>): string[] {
  const s = settingsOf(t);
  const lines: string[] = [];
  if (s.format === 'swiss') {
    lines.push(translate('tournaments.scoring.swissBase', { rounds: s.rounds }), translate('tournaments.scoring.swissBye'), translate('tournaments.scoring.swissTieBreak'), translate('tournaments.scoring.swissEnd'));
  } else {
    lines.push(translate('tournaments.scoring.arenaBase'));
    if (s.winStreak) lines.push(translate('tournaments.scoring.winStreak'));
    if (s.drawStreak) lines.push(translate('tournaments.scoring.drawStreak'));
    if (s.lossStreak) lines.push(translate('tournaments.scoring.lossStreak'));
    if (s.frenzy) lines.push(translate('tournaments.scoring.frenzy'));
  }
  lines.push(translate(s.endMode === 'wait' ? 'tournaments.scoring.endWait' : 'tournaments.scoring.endTimer'));
  return lines;
}
