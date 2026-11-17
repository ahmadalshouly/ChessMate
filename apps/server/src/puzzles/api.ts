import {
  dayKey,
  gradeAttempt,
  isProvisional,
  runTargetRating,
  updatePuzzleRating,
  type Puzzle,
  type PuzzleAttemptResponse,
  type PuzzleDto,
  type PuzzleProfileDto,
  type PuzzleRunMode,
} from '@chessmate/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PuzzleStore } from './store';

export interface PuzzleUser {
  id: string;
}

/** Resolves a bearer token to a user. Accounts plug their session lookup in here. */
export type PuzzleIdentify = (token: string) => PuzzleUser | undefined;

/**
 * Development identities, until accounts are wired in:
 * "dev:<id>:<name>" (same as the game server) and "anon:<uuid>" (a device id
 * the app creates so progress survives restarts on that device).
 */
export const devIdentify: PuzzleIdentify = (token) => {
  const dev = /^dev:([\w-]{1,64}):/.exec(token);
  if (dev && process.env.NODE_ENV !== 'production') return { id: dev[1]! };
  const anon = /^anon:([\w-]{8,64})$/.exec(token);
  if (anon) return { id: `anon_${anon[1]}` };
  return undefined;
};

export interface PuzzleApiOptions {
  store: PuzzleStore;
  identify?: PuzzleIdentify;
  now?: () => number;
  random?: () => number;
}

const RUN_PAGE = 20;
const MODES: PuzzleRunMode[] = ['streak', 'rush'];

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function toDto(p: Puzzle): PuzzleDto {
  return { id: p.id, fen: p.fen, moves: p.moves, rating: p.rating, themes: p.themes, plays: p.plays };
}

/**
 * JSON HTTP API under /api/puzzles. Returns false when the request is not
 * for this API so the caller can try other handlers.
 */
export class PuzzleApi {
  private readonly identify: PuzzleIdentify;
  private readonly now: () => number;

  constructor(private readonly opts: PuzzleApiOptions) {
    this.identify = opts.identify ?? devIdentify;
    this.now = opts.now ?? Date.now;
  }

  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/api/puzzles')) return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    this.route(req, url)
      .then((body) => json(res, 200, body))
      .catch((e) => (e instanceof HttpError ? json(res, e.status, { error: e.message }) : json(res, 500, { error: 'Server error' })));
    return true;
  }

  private user(req: IncomingMessage): PuzzleUser | undefined {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    return m ? this.identify(m[1]!) : undefined;
  }

  private async route(req: IncomingMessage, url: URL): Promise<unknown> {
    const { store } = this.opts;
    const parts = url.pathname.split('/').filter(Boolean).slice(2); // after api/puzzles
    const user = this.user(req);
    const get = req.method === 'GET';
    const post = req.method === 'POST';

    if (get && parts[0] === 'themes') return { counts: store.themeCounts() };

    if (get && parts[0] === 'daily') {
      const day = dayKey(this.now());
      const p = store.daily(day);
      if (!p) throw new HttpError(404, 'No puzzles imported yet');
      return { day, puzzle: toDto(p), attempted: user ? store.hasAttempted(user.id, p.id) : false };
    }

    if (get && parts[0] === 'next') {
      const theme = url.searchParams.get('theme') || undefined;
      if (theme && !/^\w{1,40}$/.test(theme)) throw new HttpError(400, 'Bad theme');
      const target = user ? store.rating(user.id).rating : 1500;
      const exclude = user ? store.recentPuzzleIds(user.id, 500) : new Set<string>();
      for (const id of (url.searchParams.get('skip') ?? '').split(',').filter(Boolean).slice(0, 50)) exclude.add(id);
      const p = store.pick({ rating: target, theme, exclude, random: this.opts.random });
      if (!p) throw new HttpError(404, theme ? 'No puzzles for that theme yet' : 'No puzzles imported yet');
      return { puzzle: toDto(p) };
    }

    if (get && parts[0] === 'me') return this.profile(user);

    if (parts[0] === 'run') {
      if (get) {
        const mode = parseMode(url.searchParams.get('mode'));
        const offset = clampInt(url.searchParams.get('offset'), 0, 500);
        const targets = Array.from({ length: RUN_PAGE }, (_, i) => runTargetRating(mode, offset + i));
        return { mode, offset, puzzles: store.ladder(targets, this.opts.random).map(toDto) };
      }
      if (post) {
        const body = await readJson(req);
        const mode = parseMode(body.mode);
        const score = clampInt(body.score, 0, 1000);
        if (!user) return { saved: false, best: score };
        const prevBest = store.bestRun(user.id, mode);
        store.recordRun(user.id, mode, score, this.now());
        return { saved: true, best: Math.max(prevBest, score), newBest: score > prevBest };
      }
    }

    const id = parts[0];
    if (!id || !/^[\w-]{1,16}$/.test(id)) throw new HttpError(404, 'Not found');
    const puzzle = store.get(id);
    if (!puzzle) throw new HttpError(404, 'No such puzzle');

    if (get && parts.length === 1) return { puzzle: toDto(puzzle) };

    if (post && parts[1] === 'attempt') {
      const body = await readJson(req);
      const moves = Array.isArray(body.moves) ? body.moves.filter((m: unknown): m is string => typeof m === 'string').slice(0, 64) : [];
      const hints = clampInt(body.hints, 0, 10);
      const { solved, score } = gradeAttempt(puzzle, moves, hints);
      const out: PuzzleAttemptResponse = { solved };
      if (!user) return out;
      // Only the first try at a puzzle moves the rating, and runs never do.
      const rated = body.rated !== false && !store.hasAttempted(user.id, puzzle.id);
      const before = store.rating(user.id);
      const after = rated ? updatePuzzleRating(before, puzzle, score) : before;
      if (rated) {
        store.saveRating(user.id, after, solved);
        out.rating = { before: Math.round(before.rating), after: Math.round(after.rating) };
      }
      store.recordAttempt({
        userId: user.id,
        puzzleId: puzzle.id,
        solved,
        rated,
        before: before.rating,
        after: after.rating,
        timeMs: typeof body.timeMs === 'number' ? Math.round(body.timeMs) : null,
        at: this.now(),
      });
      return out;
    }

    throw new HttpError(404, 'Not found');
  }

  private profile(user: PuzzleUser | undefined): PuzzleProfileDto {
    const { store } = this.opts;
    const r = user ? store.rating(user.id) : store.rating('');
    return {
      rating: Math.round(r.rating),
      rd: Math.round(r.rd),
      provisional: isProvisional(r),
      attempts: r.attempts,
      solved: r.solved,
      bestStreak: user ? store.bestRun(user.id, 'streak') : 0,
      bestRush: user ? store.bestRun(user.id, 'rush') : 0,
    };
  }
}

function parseMode(v: unknown): PuzzleRunMode {
  if (MODES.includes(v as PuzzleRunMode)) return v as PuzzleRunMode;
  throw new HttpError(400, 'mode must be streak or rush');
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.floor(Number(v ?? 0));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}

function json(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, any>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 16 * 1024) throw new HttpError(413, 'Body too large');
    chunks.push(c as Buffer);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}
