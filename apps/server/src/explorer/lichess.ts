import { EXPLORER_MAX_MOVES, normalizeExplorerFilters, type ExplorerFilters } from '@chessmate/core';

export const LICHESS_EXPLORER_ORIGIN = 'https://explorer.lichess.ovh';
const USER_AGENT = 'ChessMate Dig Deep (+https://chessmate.app)';
/** Lichess asks API users to wait a full minute after an HTTP 429. */
const PAUSE_AFTER_429_MS = 60_000;
const TIMEOUT_MS = 8_000;
/** Requests waiting for their turn before new ones are turned away. */
const MAX_WAITING = 24;

export type ExplorerErrorCode = 'busy' | 'unauthorized' | 'unavailable' | 'not_configured';

export class ExplorerError extends Error {
  constructor(
    readonly code: ExplorerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExplorerError';
  }
}

export interface LichessExplorerOptions {
  /** A Lichess personal API token: the opening explorer requires one since 2025 (no scopes needed). */
  token?: string;
  origin?: string;
  fetch?: typeof fetch;
  now?: () => number;
  log?: (msg: string) => void;
}

/**
 * The Lichess opening explorer, used the way Lichess asks API users to:
 * one request at a time, and a full minute's pause after a 429. Answers are
 * raw JSON; the explorer service parses and caches them.
 */
export class LichessExplorer {
  private tail: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  private pausedUntil = 0;
  private warnedAuth = false;
  private readonly origin: string;
  private readonly now: () => number;

  constructor(private readonly opts: LichessExplorerOptions = {}) {
    this.origin = (opts.origin ?? LICHESS_EXPLORER_ORIGIN).replace(/\/+$/, '');
    this.now = opts.now ?? Date.now;
  }

  /** True when it can be used: a token for Lichess's own explorer, or a self-hosted one. */
  get configured(): boolean {
    return !!this.opts.token || this.origin !== LICHESS_EXPLORER_ORIGIN;
  }

  /** URL of one position in one collection. */
  url(source: 'lichess' | 'masters', fen: string, filters?: ExplorerFilters): string {
    const q = new URLSearchParams({ fen, moves: String(EXPLORER_MAX_MOVES), topGames: '0' });
    if (source === 'lichess') {
      const f = normalizeExplorerFilters(filters);
      q.set('variant', 'standard');
      q.set('recentGames', '0');
      if (f.speeds.length) q.set('speeds', f.speeds.join(','));
      if (f.ratings.length) q.set('ratings', f.ratings.join(','));
    }
    return `${this.origin}/${source}?${q.toString()}`;
  }

  fetch(source: 'lichess' | 'masters', fen: string, filters?: ExplorerFilters): Promise<unknown> {
    if (this.now() < this.pausedUntil) return Promise.reject(new ExplorerError('busy', 'Lichess asked us to slow down: try again in a minute'));
    if (this.waiting >= MAX_WAITING) return Promise.reject(new ExplorerError('busy', 'The opening explorer is busy: try again in a moment'));
    this.waiting++;
    const run = this.tail.then(
      () => this.request(this.url(source, fen, filters)),
      () => this.request(this.url(source, fen, filters)),
    );
    this.tail = run.catch(() => undefined).finally(() => this.waiting--);
    return run;
  }

  private async request(url: string): Promise<unknown> {
    // Another request in the queue may have been told to wait.
    if (this.now() < this.pausedUntil) throw new ExplorerError('busy', 'Lichess asked us to slow down: try again in a minute');
    const f = this.opts.fetch ?? fetch;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: 'application/json' };
      if (this.opts.token) headers.authorization = `Bearer ${this.opts.token}`;
      const res = await f(url, { headers, signal: ctrl.signal });
      if (res.status === 429) {
        this.pausedUntil = this.now() + PAUSE_AFTER_429_MS;
        throw new ExplorerError('busy', 'Lichess asked us to slow down: try again in a minute');
      }
      if (res.status === 401 || res.status === 403) {
        if (!this.warnedAuth) {
          this.warnedAuth = true;
          this.opts.log?.(
            this.opts.token
              ? `Lichess refused the opening explorer token (HTTP ${res.status}): check LICHESS_TOKEN`
              : 'The Lichess opening explorer needs a token: set LICHESS_TOKEN (a free personal token from lichess.org/account/oauth/token, no scopes)',
          );
        }
        throw new ExplorerError(this.opts.token ? 'unauthorized' : 'not_configured', 'The Lichess database is not connected on this server');
      }
      if (!res.ok) throw new ExplorerError('unavailable', `Lichess explorer answered HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (e instanceof ExplorerError) throw e;
      throw new ExplorerError('unavailable', ctrl.signal.aborted ? 'Lichess explorer timed out' : 'Lichess explorer is unreachable');
    } finally {
      clearTimeout(timer);
    }
  }
}
