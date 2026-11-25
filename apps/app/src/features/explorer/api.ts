import { START_FEN, explorerCacheKey, type ExplorerFilters, type ExplorerPosition, type ExplorerSource } from '@chessmate/core';

import { API_URL } from '@/lib/config';

/** Why a lookup failed, for the message the page shows. */
export type ExplorerFailure = 'busy' | 'notConnected' | 'unavailable' | 'offline';

export class ExplorerFetchError extends Error {
  constructor(readonly reason: ExplorerFailure) {
    super(reason);
    this.name = 'ExplorerFetchError';
  }
}

export interface ExplorerAnswer {
  position: ExplorerPosition;
  /** Lichess could not answer and the server sent an older copy. */
  stale: boolean;
}

/** Positions already seen this session, so stepping back and forth is instant. */
const seen = new Map<string, { answer: ExplorerAnswer; at: number }>();
const MAX_SEEN = 300;
const SEEN_MS: Record<ExplorerSource, number> = { lichess: 30 * 60_000, masters: 30 * 60_000, chessmate: 60_000 };

/** A position in one collection, from the ChessMate server (which fetches and caches Lichess). */
export async function fetchExplorer(source: ExplorerSource, fen: string, filters: ExplorerFilters, signal?: AbortSignal): Promise<ExplorerAnswer> {
  const key = explorerCacheKey(source, fen, filters);
  const hit = seen.get(key);
  if (hit && Date.now() - hit.at < SEEN_MS[source]) return hit.answer;
  const q = new URLSearchParams({ source, fen });
  if (source === 'lichess') {
    if (filters.speeds?.length) q.set('speeds', filters.speeds.join(','));
    if (filters.ratings?.length) q.set('ratings', filters.ratings.join(','));
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/explorer?${q.toString()}`, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ExplorerFetchError('offline');
  }
  const body = (await res.json().catch(() => null)) as (ExplorerAnswer & { code?: string }) | null;
  if (!res.ok || !body?.position) {
    const code = body?.code;
    throw new ExplorerFetchError(
      res.status === 429 || code === 'busy' ? 'busy' : code === 'not_configured' || code === 'unauthorized' ? 'notConnected' : 'unavailable',
    );
  }
  const answer = { position: body.position, stale: !!body.stale };
  if (!answer.stale) {
    seen.delete(key);
    seen.set(key, { answer, at: Date.now() });
    if (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value!);
  }
  return answer;
}

/**
 * How many opening moves of a game are theory by the masters' games (Book
 * grades in a review). Zero when the server can't say within `timeoutMs`:
 * the review then uses the named openings alone, as the server does.
 */
export async function fetchTheoryPlies(moves: string[], initialFen: string = START_FEN, timeoutMs = 6_000): Promise<number> {
  if (!moves.length) return 0;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const q = new URLSearchParams({ moves: moves.slice(0, 40).join(',') });
    if (initialFen !== START_FEN) q.set('fen', initialFen);
    const res = await fetch(`${API_URL}/api/explorer/theory?${q.toString()}`, { signal: ctrl.signal });
    if (!res.ok) return 0;
    const body = (await res.json()) as { plies?: unknown };
    return typeof body.plies === 'number' && Number.isInteger(body.plies) && body.plies >= 0 ? body.plies : 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}
