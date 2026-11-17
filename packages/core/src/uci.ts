import type { Score } from './evaluation';

export interface UciInfo {
  depth?: number;
  seldepth?: number;
  multipv?: number;
  score?: Score;
  /** True when the score is only a bound (lowerbound/upperbound). */
  bound?: 'lower' | 'upper';
  nodes?: number;
  nps?: number;
  timeMs?: number;
  pv?: string[];
}

/** Parses a UCI "info ..." line. Scores stay relative to the side to move. */
export function parseInfoLine(line: string): UciInfo | null {
  if (!line.startsWith('info ')) return null;
  const t = line.split(/\s+/);
  const info: UciInfo = {};
  for (let i = 1; i < t.length; i++) {
    const key = t[i];
    const num = () => Number(t[++i]);
    switch (key) {
      case 'depth':
        info.depth = num();
        break;
      case 'seldepth':
        info.seldepth = num();
        break;
      case 'multipv':
        info.multipv = num();
        break;
      case 'nodes':
        info.nodes = num();
        break;
      case 'nps':
        info.nps = num();
        break;
      case 'time':
        info.timeMs = num();
        break;
      case 'score': {
        const kind = t[++i];
        const v = num();
        info.score = kind === 'mate' ? { mate: v } : { cp: v };
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          info.bound = t[++i] === 'lowerbound' ? 'lower' : 'upper';
        }
        break;
      }
      case 'pv':
        info.pv = t.slice(i + 1).filter(Boolean);
        i = t.length;
        break;
      default:
        break;
    }
  }
  return info;
}

export function parseBestMove(line: string): { best: string; ponder?: string } | null {
  const m = /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/.exec(line);
  if (!m) return null;
  return { best: m[1]!, ponder: m[2] };
}

/** Builds the "go" command for a search. */
export function goCommand(opts: { depth?: number; movetimeMs?: number; nodes?: number }): string {
  const parts = ['go'];
  if (opts.depth) parts.push('depth', String(opts.depth));
  if (opts.movetimeMs) parts.push('movetime', String(opts.movetimeMs));
  if (opts.nodes) parts.push('nodes', String(opts.nodes));
  if (parts.length === 1) parts.push('depth', '18');
  return parts.join(' ');
}

/** Maps a target rating to engine strength options (Skill Level 0..20). */
export function strengthForRating(rating: number): { skill: number; depth: number; movetimeMs: number } {
  const r = Math.max(400, Math.min(3000, rating));
  const skill = Math.round(((r - 400) / 2600) * 20);
  const depth = Math.max(1, Math.round(1 + ((r - 400) / 2600) * 19));
  const movetimeMs = Math.round(100 + ((r - 400) / 2600) * 1400);
  return { skill, depth, movetimeMs };
}
