import { EVENT_LIMITS, LICHESS_ORIGIN, type LichessBroadcastRound, type LichessBroadcastTour } from '@chessmate/core';
import { listSyncedRounds, type BroadcastRoundRow, type Database } from '@chessmate/db';

import type { EventService } from './events';

export type Fetcher = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ status: number; ok: boolean; text(): Promise<string>; body?: ReadableStream<Uint8Array> | null }>;

export interface BroadcastSyncOptions {
  db: Database;
  events: EventService;
  now?: () => number;
  fetch?: Fetcher;
  /** Lichess base URL (tests point it elsewhere). */
  lichessOrigin?: string;
  /** Lichess tiers to import (4 = high, 5 = best). */
  minTier?: number;
}

const TICK_MS = 4_000;
const IMPORT_EVERY_MS = 30 * 60_000;
const FETCH_TIMEOUT_MS = 12_000;
/** Poll intervals: a round with games in progress, one not started yet, and after an error. */
const LIVE_MS = { pgnUrl: 5_000, lichess: 12_000 } as const;
/** While a Lichess round is streamed, polling only double-checks it now and then. */
const STREAMED_POLL_MS = 90_000;
/** Moves arrive whole; a pause this long after data means the game's PGN is complete. */
const STREAM_FLUSH_MS = 400;
const STREAM_RETRY_MS = 5_000;
const MAX_STREAMS = 24;
const IDLE_MS = 45_000;
const ERROR_MS = 60_000;
/** A round whose games are all decided and unchanged this long stops being polled. */
const SETTLED_MS = 10 * 60_000;
/** Lichess asked us to slow down (HTTP 429): wait a full minute. */
const LICHESS_PAUSE_MS = 60_000;
const MAX_IMPORTED = 15;
const USER_AGENT = 'ChessMate broadcasts (+https://chessmate.app)';

/**
 * Keeps broadcast rounds up to date from their live sources (a PGN link or a
 * Lichess round), one request at a time, and imports Lichess's official
 * broadcasts every 30 minutes when that is switched on.
 */
export class BroadcastSync {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private readonly nextAt = new Map<string, number>();
  private readonly settledSince = new Map<string, number>();
  private lichessPausedUntil = 0;
  private lastImport = 0;
  /** Live Lichess streams by round id. */
  private readonly streams = new Map<string, AbortController>();
  /** Rounds that cannot be streamed (no stream support), and when a stream may be retried. */
  private readonly noStream = new Set<string>();
  private readonly streamRetryAt = new Map<string, number>();

  constructor(private readonly opts: BroadcastSyncOptions) {}

  private now() {
    return this.opts.now?.() ?? Date.now();
  }

  private get origin() {
    return this.opts.lichessOrigin ?? LICHESS_ORIGIN;
  }

  start() {
    if (this.timer) return;
    // First import shortly after boot, then every 30 minutes.
    this.lastImport = this.now() - IMPORT_EVERY_MS + 20_000;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const c of this.streams.values()) c.abort();
    this.streams.clear();
  }

  /** Lets "Sync now" fetch a round on the next tick. */
  wake(roundId: string) {
    this.nextAt.delete(roundId);
    this.settledSince.delete(roundId);
    this.noStream.delete(roundId);
    this.streamRetryAt.delete(roundId);
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.now() - this.lastImport >= IMPORT_EVERY_MS) {
        this.lastImport = this.now();
        await this.importLichess().catch((e) => console.warn('lichess import failed:', e instanceof Error ? e.message : e));
      }
      const rounds = await listSyncedRounds(this.opts.db);
      this.manageStreams(rounds);
      for (const r of rounds) {
        if (!(await this.due(r))) continue;
        await this.syncRound(r);
      }
    } catch (e) {
      console.warn('broadcast sync failed:', e);
    } finally {
      this.busy = false;
    }
  }

  private async due(r: BroadcastRoundRow): Promise<boolean> {
    const now = this.now();
    if ((this.nextAt.get(r.id) ?? 0) > now) return false;
    // Not started yet: begin 15 minutes before the round.
    if (r.startsAt && now < r.startsAt.getTime() - 15 * 60_000) {
      this.nextAt.set(r.id, Math.min(r.startsAt.getTime() - 15 * 60_000, now + 5 * 60_000));
      return false;
    }
    // Event long over: stop.
    const ends = await this.opts.events.eventEndsAt(r.eventId);
    if (ends !== null && now > ends + 2 * 86_400_000) {
      await this.opts.events.markSynced(r, { finished: true });
      return false;
    }
    if (r.sourceKind === 'lichess' && now < this.lichessPausedUntil) return false;
    return true;
  }

  /** Opens a live stream for each Lichess round in play and closes the ones that are over. */
  private manageStreams(rounds: BroadcastRoundRow[]) {
    const now = this.now();
    const live = new Set<string>();
    for (const r of rounds) {
      if (r.sourceKind !== 'lichess' || !r.lichessRoundId || this.noStream.has(r.id)) continue;
      if (r.startsAt && now < r.startsAt.getTime() - 10 * 60_000) continue;
      live.add(r.id);
      if (this.streams.has(r.id) || this.streams.size >= MAX_STREAMS) continue;
      if ((this.streamRetryAt.get(r.id) ?? 0) > now || now < this.lichessPausedUntil) continue;
      void this.openStream(r);
    }
    for (const [id, ctrl] of this.streams) {
      if (!live.has(id)) {
        ctrl.abort();
        this.streams.delete(id);
      }
    }
  }

  /**
   * Follows a Lichess round as it is played: Lichess sends every game's PGN
   * first, then a game's full PGN again each time a move is made.
   */
  private async openStream(r: BroadcastRoundRow) {
    const ctrl = new AbortController();
    this.streams.set(r.id, ctrl);
    const f: Fetcher = this.opts.fetch ?? ((u, init) => fetch(u, init));
    let buffer = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let lastMark = 0;
    let chain: Promise<unknown> = Promise.resolve();
    const flush = () => {
      flushTimer = null;
      const text = buffer;
      buffer = '';
      if (!text.trim()) return;
      chain = chain.then(async () => {
        try {
          await this.opts.events.applyPgn(r, text, { replace: false });
          if (this.now() - lastMark > 30_000) {
            lastMark = this.now();
            await this.opts.events.markSynced(r, {});
          }
        } catch (e) {
          console.warn('broadcast stream update failed:', e instanceof Error ? e.message : e);
        }
      });
    };
    try {
      const res = await f(`${this.origin}/api/stream/broadcast/round/${r.lichessRoundId}.pgn`, {
        signal: ctrl.signal,
        headers: { 'user-agent': USER_AGENT, accept: 'application/x-chess-pgn' },
      });
      if (res.status === 429) this.lichessPausedUntil = this.now() + LICHESS_PAUSE_MS;
      if (!res.ok) throw new Error(`stream answered ${res.status}`);
      if (!res.body) {
        // No streaming here (tests, odd runtimes): keep polling instead.
        this.noStream.add(r.id);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, STREAM_FLUSH_MS);
      }
    } catch (e) {
      if (!ctrl.signal.aborted) console.warn(`broadcast stream for round ${r.id} ended:`, e instanceof Error ? e.message : e);
    } finally {
      if (flushTimer) clearTimeout(flushTimer);
      flush();
      if (this.streams.get(r.id) === ctrl) this.streams.delete(r.id);
      this.streamRetryAt.set(r.id, this.now() + STREAM_RETRY_MS);
    }
  }

  private async get(url: string): Promise<string> {
    const f: Fetcher = this.opts.fetch ?? ((u, init) => fetch(u, init));
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await f(url, { signal: ac.signal, headers: { 'user-agent': USER_AGENT, accept: 'application/x-chess-pgn, application/json, text/plain, */*' } });
      if (res.status === 429) {
        if (url.startsWith(this.origin)) this.lichessPausedUntil = this.now() + LICHESS_PAUSE_MS;
        throw new Error('The source asked us to slow down (429)');
      }
      if (!res.ok) throw new Error(`The source answered ${res.status}`);
      const body = await res.text();
      if (body.length > EVENT_LIMITS.pgnChars) throw new Error('The source file is too large');
      return body;
    } catch (e) {
      if (ac.signal.aborted) throw new Error('The source did not answer in time');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  private sourceUrl(r: BroadcastRoundRow): string | null {
    if (r.sourceKind === 'pgnUrl') return r.sourceUrl;
    if (r.sourceKind === 'lichess' && r.lichessRoundId) return `${this.origin}/api/broadcast/round/${r.lichessRoundId}.pgn`;
    return null;
  }

  /** Fetches a round's source and applies it. `final`: the source says it is over, stop after this. */
  async syncRound(r: BroadcastRoundRow, final = false): Promise<void> {
    const url = this.sourceUrl(r);
    const now = this.now();
    if (!url) return;
    try {
      const pgn = await this.get(url);
      const res = await this.opts.events.applyPgn(r, pgn, { replace: true });
      let finished = final;
      if (res.allFinished && res.changed === 0) {
        const since = this.settledSince.get(r.id) ?? now;
        this.settledSince.set(r.id, since);
        if (now - since >= SETTLED_MS) finished = true;
      } else this.settledSince.delete(r.id);
      await this.opts.events.markSynced(r, { error: res.games ? null : 'No games in the source yet', finished });
      const live = res.games > 0 && !res.allFinished;
      if (finished) {
        this.streams.get(r.id)?.abort();
        this.streams.delete(r.id);
      }
      const streamed = this.streams.has(r.id);
      this.nextAt.set(r.id, now + (streamed ? STREAMED_POLL_MS : live ? LIVE_MS[r.sourceKind === 'lichess' ? 'lichess' : 'pgnUrl'] : IDLE_MS));
    } catch (e) {
      await this.opts.events.markSynced(r, { error: e instanceof Error ? e.message.slice(0, 200) : 'Sync failed' });
      this.nextAt.set(r.id, now + ERROR_MS);
    }
  }

  private async json(url: string): Promise<unknown> {
    return JSON.parse(await this.get(url)) as unknown;
  }

  /** Imports Lichess's top official broadcasts (active and upcoming). */
  async importLichess(): Promise<number> {
    if (!(await this.opts.events.settings()).lichessImport) return 0;
    if (this.now() < this.lichessPausedUntil) return 0;
    const top = (await this.json(`${this.origin}/api/broadcast/top?page=1`)) as { active?: unknown[]; upcoming?: unknown[] };
    const entries = [...(Array.isArray(top.active) ? top.active : []), ...(Array.isArray(top.upcoming) ? top.upcoming : [])];
    const minTier = this.opts.minTier ?? 4;
    const tours: LichessBroadcastTour[] = [];
    for (const raw of entries) {
      const e = raw as { tour?: LichessBroadcastTour } & LichessBroadcastTour;
      const tour = e.tour ?? e;
      if (!tour?.id || !tour.name || tours.some((t) => t.id === tour.id)) continue;
      if ((tour.tier ?? 0) < minTier) continue;
      tours.push(tour);
      if (tours.length >= MAX_IMPORTED) break;
    }
    let imported = 0;
    for (const t of tours) {
      const full = (await this.json(`${this.origin}/api/broadcast/${encodeURIComponent(t.id)}`)) as { tour?: LichessBroadcastTour; rounds?: LichessBroadcastRound[] };
      const rounds = (Array.isArray(full.rounds) ? full.rounds : []).filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string');
      const finalSync = await this.opts.events.importLichessTour({ ...t, ...(full.tour ?? {}) }, rounds);
      for (const r of finalSync) await this.syncRound(r, true);
      imported++;
    }
    return imported;
  }
}
