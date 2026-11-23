import { EVENT_LIMITS, LICHESS_ORIGIN, federationIso, type LichessBroadcastRound, type LichessBroadcastTour } from '@chessmate/core';
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
  /** Gap between requests to Lichess (it asks for one request at a time). */
  lichessGapMs?: number;
}

const TICK_MS = 4_000;
const IMPORT_EVERY_MS = 30 * 60_000;
const FETCH_TIMEOUT_MS = 12_000;
/** Poll intervals: a round with games in progress, one not started yet, and after an error. */
const LIVE_MS = { pgnUrl: 5_000, lichess: 20_000 } as const;
/** A live Lichess round someone is watching (and that is not streamed) is polled this often. */
const WATCHED_LICHESS_MS = 4_000;
/** Someone opened the event this recently: it counts as watched. */
const WATCHED_FOR_MS = 3 * 60_000;
/** Lichess allows one request at a time; a refused one is retried this soon. */
const BUSY_RETRY_MS = 5_000;
/** While a Lichess round is streamed, polling only double-checks it now and then. */
const STREAMED_POLL_MS = 90_000;
/** Moves arrive whole; a pause this long after data means the game's PGN is complete. */
const STREAM_FLUSH_MS = 400;
/** A stream that ended after sending data reconnects quickly; one that sent nothing backs off. */
const STREAM_RECONNECT_MS = 3_000;
const STREAM_BACKOFF_MS = { first: 15_000, max: 10 * 60_000 } as const;
/** Lichess serves one stream at a time per server (a second one is refused with 429). */
const MAX_STREAMS = 1;
/** Imported tournaments with rounds in play are re-read this often, for Lichess's own round status. */
const TOUR_REFRESH_MS = 5 * 60_000;
/** Without Lichess's status, a round counts as in play from 10 minutes before it until this long after. */
const ASSUMED_ROUND_MS = 8 * 3_600_000;
const IDLE_MS = 45_000;
const ERROR_MS = 60_000;
/** A round whose games are all decided and unchanged this long stops being polled. */
const SETTLED_MS = 10 * 60_000;
/** Lichess asked us to slow down (HTTP 429): wait a full minute. */
const LICHESS_PAUSE_MS = 60_000;
const MAX_IMPORTED = 15;
/** A source that answers "not found" is retried less and less often, up to this gap. */
const NOT_FOUND_MAX_MS = 30 * 60_000;
/** After this many "not found" answers in a row (once the round should have started), the round stops syncing. */
const NOT_FOUND_GIVE_UP = 5;
/** A round's source may legitimately be missing until a while after the round starts. */
const NOT_FOUND_GRACE_MS = 60 * 60_000;
const USER_AGENT = 'ChessMate broadcasts (+https://chessmate.app)';

/** Lichess refused a request because another one was still running. */
class BusyError extends Error {
  constructor() {
    super('Lichess is busy with another request');
  }
}

/** The source answered 404 or 410: the link is wrong, or the round was deleted. */
class NotFoundError extends Error {
  constructor(status: number) {
    super(`The source answered ${status}`);
  }
}

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
  /** Streams in a row that ended without sending anything, per round. */
  private readonly streamFails = new Map<string, number>();
  /** Lichess's own status of each round (from importing its tournament), by Lichess round id. */
  private readonly lichessState = new Map<string, { ongoing: boolean; finished: boolean }>();
  private lastTourRefresh = 0;
  /** Rounds Lichess calls finished that were re-read once since the server started (repairs rounds synced wrongly before). */
  private readonly verified = new Set<string>();
  /** When players' federations were last read from Lichess, by round id. */
  private readonly playersAt = new Map<string, number>();
  /** The last error per round and how many times in a row it happened (one log line per new error). */
  private readonly failures = new Map<string, { message: string; count: number; notFound: number }>();
  /** When the next request to Lichess may go out. */
  private lichessNextAt = 0;

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
    this.streamFails.delete(roundId);
    this.failures.delete(roundId);
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.now() - this.lastImport >= IMPORT_EVERY_MS) {
        this.lastImport = this.now();
        await this.importLichess().catch((e) => console.warn('lichess import failed:', e instanceof Error ? e.message : e));
      }
      let rounds = await listSyncedRounds(this.opts.db);
      if (this.now() - this.lastTourRefresh >= TOUR_REFRESH_MS) {
        this.lastTourRefresh = this.now();
        if (await this.refreshTours(rounds).catch((e) => void console.warn('lichess refresh failed:', e instanceof Error ? e.message : e))) rounds = await listSyncedRounds(this.opts.db);
      }
      this.manageStreams(rounds);
      for (const r of rounds) {
        if (!(await this.due(r))) continue;
        const state = r.lichessRoundId ? this.lichessState.get(r.lichessRoundId) : undefined;
        await this.syncRound(r, r.sourceKind === 'lichess' && state?.finished === true);
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

  /** Whether a Lichess round is being played now: Lichess's own status when known, else its start time. */
  private inPlay(r: BroadcastRoundRow): boolean {
    const state = r.lichessRoundId ? this.lichessState.get(r.lichessRoundId) : undefined;
    if (state) return state.ongoing && !state.finished;
    const now = this.now();
    if (!r.startsAt) return false;
    const t = r.startsAt.getTime();
    return now >= t - 10 * 60_000 && now <= t + ASSUMED_ROUND_MS;
  }

  private remember(rounds: LichessBroadcastRound[]) {
    for (const lr of rounds) this.lichessState.set(lr.id, { ongoing: lr.ongoing === true, finished: lr.finished === true });
  }

  /** After importing a tour: each round Lichess has finished is re-read once per server run, even if marked done. */
  private async verifyFinished(eventId: string, lrs: LichessBroadcastRound[]) {
    const finished = new Set(lrs.filter((lr) => lr.finished).map((lr) => lr.id));
    if (!finished.size) return;
    for (const r of await this.opts.events.roundsOf(eventId)) {
      if (r.sourceKind !== 'lichess' || !r.lichessRoundId || !finished.has(r.lichessRoundId) || !r.sourceFinished || this.verified.has(r.id)) continue;
      this.verified.add(r.id);
      // Hand it back to the regular loop, which retries after errors and pauses until the round is read.
      await this.opts.events.reopenSync(r);
      this.nextAt.delete(r.id);
    }
  }

  /** Players' federations (and FIDE ids) from Lichess's round data: the PGN files leave them out. */
  private async readPlayers(r: BroadcastRoundRow) {
    if (!r.lichessRoundId) return;
    const data = (await this.json(`${this.origin}/api/broadcast/-/-/${encodeURIComponent(r.lichessRoundId)}`)) as {
      games?: { players?: { name?: unknown; fideId?: unknown; fed?: unknown }[] }[];
    };
    const players: { name: string; fideId: string | null; federation: string }[] = [];
    for (const g of Array.isArray(data.games) ? data.games : []) {
      for (const p of Array.isArray(g.players) ? g.players : []) {
        const federation = federationIso(typeof p.fed === 'string' ? p.fed : null);
        if (typeof p.name !== 'string' || !federation) continue;
        players.push({ name: p.name, fideId: typeof p.fideId === 'number' || typeof p.fideId === 'string' ? String(p.fideId) : null, federation });
      }
    }
    if (players.length) await this.opts.events.applyFederations(r, players);
  }

  /** Re-reads imported Lichess tournaments that still have rounds to follow. Returns true when any round finished. */
  private async refreshTours(rounds: BroadcastRoundRow[]): Promise<boolean> {
    if (this.now() < this.lichessPausedUntil) return false;
    const tours = new Map<string, string>();
    for (const r of rounds) {
      if (r.sourceKind !== 'lichess' || tours.has(r.eventId)) continue;
      const tour = await this.opts.events.lichessTourOf(r.eventId);
      if (tour) tours.set(r.eventId, tour);
    }
    let changed = false;
    for (const tourId of new Set(tours.values())) {
      const full = (await this.json(`${this.origin}/api/broadcast/${encodeURIComponent(tourId)}`)) as { tour?: LichessBroadcastTour; rounds?: LichessBroadcastRound[] };
      if (!full.tour?.id || !full.tour.name) continue;
      const lrs = (Array.isArray(full.rounds) ? full.rounds : []).filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string');
      this.remember(lrs);
      const finalSync = await this.opts.events.importLichessTour(full.tour, lrs);
      for (const r of finalSync) {
        await this.syncRound(r, true);
        changed = true;
      }
      const eventId = [...tours.entries()].find(([, t]) => t === tourId)?.[0];
      if (eventId) await this.verifyFinished(eventId, lrs);
    }
    return changed;
  }

  private watched(r: BroadcastRoundRow): boolean {
    return this.now() - this.opts.events.lastViewed(r.eventId) < WATCHED_FOR_MS;
  }

  /**
   * Streams the Lichess round in play that matters most (watched lately, then
   * most recent); every other round is polled. Lichess allows a single stream.
   */
  private manageStreams(rounds: BroadcastRoundRow[]) {
    const now = this.now();
    const candidates = rounds
      .filter((r) => r.sourceKind === 'lichess' && r.lichessRoundId && !this.noStream.has(r.id) && this.inPlay(r))
      .sort((a, b) => this.opts.events.lastViewed(b.eventId) - this.opts.events.lastViewed(a.eventId) || (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0));
    const ready = candidates.filter((r) => (this.streamRetryAt.get(r.id) ?? 0) <= now);
    const want = new Set(ready.slice(0, MAX_STREAMS).map((r) => r.id));
    for (const [id, ctrl] of this.streams) {
      const r = candidates.find((c) => c.id === id);
      // Keep a working stream while its round is in play and someone watches it (no flapping between
      // two watched events); otherwise hand the slot to the round that matters most now.
      const keep = r && (want.has(id) || this.watched(r));
      if (!keep) {
        ctrl.abort();
        this.streams.delete(id);
      }
    }
    if (now < this.lichessPausedUntil) return;
    for (const r of ready) {
      if (this.streams.size >= MAX_STREAMS) break;
      if (!want.has(r.id) || this.streams.has(r.id)) continue;
      void this.openStream(r);
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
    let received = false;
    let busy = false;
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
      if (res.status === 429) {
        // "Only N request(s) at a time" just means busy; anything else is a real slow-down.
        const why = await res.text().catch(() => '');
        if (/at a time/i.test(why)) busy = true;
        else this.lichessPausedUntil = this.now() + LICHESS_PAUSE_MS;
      }
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
        if (buffer.trim()) received = true;
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, STREAM_FLUSH_MS);
      }
    } catch (e) {
      if (!ctrl.signal.aborted) console.warn(`broadcast stream for round ${r.id} ended:`, e instanceof Error ? e.message : e);
    } finally {
      if (flushTimer) clearTimeout(flushTimer);
      flush();
      if (this.streams.get(r.id) === ctrl) this.streams.delete(r.id);
      // Reconnect quickly after a stream that worked; back off from one that sent nothing.
      if (busy) this.streamRetryAt.set(r.id, this.now() + BUSY_RETRY_MS);
      else {
        const fails = received ? 0 : (this.streamFails.get(r.id) ?? 0) + 1;
        this.streamFails.set(r.id, fails);
        this.streamRetryAt.set(r.id, this.now() + (fails ? Math.min(STREAM_BACKOFF_MS.max, STREAM_BACKOFF_MS.first * 2 ** (fails - 1)) : STREAM_RECONNECT_MS));
      }
      // Whatever happened, have the next poll fetch the whole round soon.
      if (!ctrl.signal.aborted) this.nextAt.delete(r.id);
    }
  }

  /** Waits for Lichess's turn: one request at a time, a short gap between them. */
  private async lichessTurn() {
    const gap = this.opts.lichessGapMs ?? 1_000;
    if (!gap) return;
    const at = Math.max(Date.now(), this.lichessNextAt);
    this.lichessNextAt = at + gap;
    const wait = at - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  private async get(url: string): Promise<string> {
    const f: Fetcher = this.opts.fetch ?? ((u, init) => fetch(u, init));
    if (url.startsWith(this.origin)) {
      if (this.now() < this.lichessPausedUntil) throw new Error('Lichess asked us to slow down; waiting a minute');
      await this.lichessTurn();
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await f(url, { signal: ac.signal, headers: { 'user-agent': USER_AGENT, accept: 'application/x-chess-pgn, application/json, text/plain, */*' } });
      if (res.status === 429) {
        const why = await res.text().catch(() => '');
        // Lichess allows one request at a time: "busy" is retried soon, a real slow-down pauses everything.
        if (/at a time/i.test(why)) throw new BusyError();
        if (url.startsWith(this.origin)) this.lichessPausedUntil = this.now() + LICHESS_PAUSE_MS;
        throw new Error('The source asked us to slow down (429)');
      }
      if (res.status === 404 || res.status === 410) throw new NotFoundError(res.status);
      if (!res.ok) throw new Error(`The source answered ${res.status}`);
      const body = await res.text();
      if (body.length > EVENT_LIMITS.pgnChars) throw new Error('The source file is too large');
      return body;
    } catch (e) {
      if (ac.signal.aborted && !(e instanceof BusyError)) throw new Error('The source did not answer in time');
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
      this.failures.delete(r.id);
      const res = await this.opts.events.applyPgn(r, pgn, { replace: true });
      // Nothing readable: never call the round done on that, try again later.
      let finished = final && res.games > 0;
      if (res.allFinished && res.changed === 0) {
        const since = this.settledSince.get(r.id) ?? now;
        this.settledSince.set(r.id, since);
        if (now - since >= SETTLED_MS) finished = true;
      } else this.settledSince.delete(r.id);
      await this.opts.events.markSynced(r, { error: res.games ? null : pgn.trim() ? 'No readable games in the source' : 'No games in the source yet', finished });
      // Flags: federations come from Lichess's round data, read once per round and every few minutes while it is played.
      if (r.sourceKind === 'lichess' && res.games > 0 && now - (this.playersAt.get(r.id) ?? 0) > (finished ? 0 : 5 * 60_000)) {
        this.playersAt.set(r.id, now);
        await this.readPlayers(r).catch((e) => {
          if (!(e instanceof BusyError)) console.warn('lichess players failed:', e instanceof Error ? e.message : e);
        });
      }
      const live = res.games > 0 && !res.allFinished;
      if (finished) {
        this.streams.get(r.id)?.abort();
        this.streams.delete(r.id);
      }
      const streamed = this.streams.has(r.id);
      const liveMs = r.sourceKind === 'lichess' ? (this.watched(r) ? WATCHED_LICHESS_MS : LIVE_MS.lichess) : LIVE_MS.pgnUrl;
      this.nextAt.set(r.id, now + (streamed ? STREAMED_POLL_MS : live ? liveMs : IDLE_MS));
    } catch (e) {
      if (e instanceof BusyError) {
        this.nextAt.set(r.id, now + BUSY_RETRY_MS);
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      const prev = this.failures.get(r.id);
      const notFound = e instanceof NotFoundError ? (prev?.notFound ?? 0) + 1 : 0;
      const failure = { message, count: prev?.message === message ? prev.count + 1 : 1, notFound };
      this.failures.set(r.id, failure);
      // The source was not found several times in a row, well after the round began: it is gone (a wrong link,
      // or a round the organiser deleted). Stop polling it; editing the round or "Sync now" starts it again.
      const started = !r.startsAt || now > r.startsAt.getTime() + NOT_FOUND_GRACE_MS;
      if (notFound >= NOT_FOUND_GIVE_UP && started) {
        console.warn(`broadcast round ${r.id} sync stopped: ${message} ${notFound} times in a row (${url})`);
        await this.opts.events.markSynced(r, { error: `${message}: the round was not found, so syncing stopped. Check its link, then press Sync now.`.slice(0, 200), finished: true });
        this.failures.delete(r.id);
        this.streams.get(r.id)?.abort();
        this.streams.delete(r.id);
        return;
      }
      // One log line per new error, not one per retry.
      if (failure.count === 1) console.warn(`broadcast round ${r.id} sync failed: ${message} (${url})`);
      await this.opts.events.markSynced(r, { error: message.slice(0, 200) });
      this.nextAt.set(r.id, now + (notFound ? Math.min(NOT_FOUND_MAX_MS, ERROR_MS * 2 ** (notFound - 1)) : ERROR_MS));
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
    this.lastTourRefresh = this.now();
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
      this.remember(rounds);
      const finalSync = await this.opts.events.importLichessTour({ ...t, ...(full.tour ?? {}) }, rounds);
      for (const r of finalSync) await this.syncRound(r, true);
      const ev = await this.opts.events.eventOfLichessTour(t.id);
      if (ev) await this.verifyFinished(ev, rounds);
      imported++;
    }
    return imported;
  }
}
