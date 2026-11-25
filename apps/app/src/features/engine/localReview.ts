import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ANALYSIS_LIMITS,
  Game,
  buildReview,
  lineFromInfo,
  positionEvalFrom,
  positionKey,
  pvToSan,
  terminalScore,
  terminalState,
  type EngineLine,
  type GameReview,
  type MoveClass,
  type PositionAnalysis,
  type PositionEval,
} from '@chessmate/core';

import { AbortError, localEngine } from './localEngine';
import { evaluateOnServer, isTransient } from './serverEngine';

/**
 * Reviews on the device search in two passes. First every position quickly
 * (depth 10, two lines: the second spots only moves). Then the positions
 * around every move the quick pass did not call best, excellent, book or
 * forced are searched again deeper (depth 14): those are the grades a quick
 * search gets wrong, and the ones a player reads. Each engine walks a stretch
 * of the positions backwards with the game's moves (see gradePositions).
 *
 * Measured on 40 test games between Stockfish players of club strength
 * (3,590 positions) against Stockfish 16 at depth 20, with this lite engine
 * on one desktop core: the old single pass at depth 12 found 68% of the
 * blunders, put 78.5% of moves in the same grade group (best to excellent,
 * good, inaccuracy, mistake, blunder or miss) and was off by 1.0 accuracy
 * points per player. These two passes find 85% of the blunders, agree on
 * 81.4% and are off by 0.85, nearly what depth 14 everywhere gives, for
 * about 2.3 times the old search time (depth 14 everywhere: 3.6 times). The
 * deep pass takes about half the positions. The time caps stop one sharp
 * position stalling a review.
 */
export const LOCAL_REVIEW = { depth: 10, multipv: 2, movetimeMs: 1500 } as const;
export const DEEP_REVIEW = { depth: 14, multipv: 2, movetimeMs: 4000 } as const;
/** A device that can't run its engine gets one pass from the server's (a native Stockfish, quicker per depth). */
const SERVER_REVIEW = { depth: 12, movetimeMs: 1500 } as const;
/** Grades from the quick pass that are checked again with deeper searches. */
const DEEPEN: ReadonlySet<MoveClass> = new Set<MoveClass>(['masterpiece', 'brilliant', 'great', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder']);
/** Deeper searches can turn a neighbouring move into one worth deepening too: at most this many rounds. */
const DEEP_ROUNDS = 3;
/** About how many quick searches one deep search costs (measured: ~10x), for the progress bar only. */
const DEEP_COST = 10;
/** Share of positions the deep pass usually takes, used for the progress bar until the quick pass is done. */
const DEEP_SHARE_GUESS = 0.5;

export interface ReviewSnapshot {
  /** Graded so far: the moves from the start up to the first one still being searched. */
  review: GameReview | null;
  /** Work done / to do, counted in quick searches (a deep one counts as several). */
  done: number;
  total: number;
  final: boolean;
  error?: string;
  /** Answered from a review already on this device, without searching. */
  cached?: boolean;
  /** Engine results per position, on the finished snapshot (absent for reviews kept from before they were saved). */
  evals?: PositionEval[];
  /** Whose engine is grading: this device's, or the server's (the device can't run one, or it stalled). */
  where?: 'device' | 'server';
}

export interface ReviewRequest {
  moves: string[];
  initialFen: string;
}

type Listener = (s: ReviewSnapshot) => void;

interface Job {
  key: string;
  ctrl: AbortController;
  listeners: Set<Listener>;
  /** Started when a game ended: keeps going with nobody watching, so Review opens finished. */
  keep: boolean;
  last: ReviewSnapshot;
}

const jobs = new Map<string, Job>();
interface Finished {
  review: GameReview;
  evals?: PositionEval[];
}
/** Finished reviews this session, newest last. */
const finished = new Map<string, Finished>();
/** Told about every review finished on this device (for accuracy badges and saving it). */
const finishedListeners = new Set<(req: ReviewRequest, review: GameReview, evals?: PositionEval[]) => void>();

export function onReviewFinished(fn: (req: ReviewRequest, review: GameReview, evals?: PositionEval[]) => void): () => void {
  finishedListeners.add(fn);
  return () => finishedListeners.delete(fn);
}
/** Every position the device has searched this session (positions repeat across games and retries). */
const evalCache = new Map<string, PositionEval>();
const MAX_FINISHED = 30;
const MAX_EVALS = 6000;
/** Saved reviews survive restarts; kept small, since storage on phones is limited. */
const STORE_PREFIX = 'review:v2:';
const STORE_INDEX = 'review:v2:index';
const MAX_STORED = 20;
/** Partial results are rebuilt at most this often while moves come in. */
const EMIT_MS = 250;

/** Content key: the same start position and moves give the same review. */
export function reviewKey(initialFen: string, moves: string[]): string {
  return `${LOCAL_REVIEW.depth}-${DEEP_REVIEW.depth}|${initialFen}|${moves.join(' ')}`;
}

/** Short stable id for storage keys (FNV-1a, two seeds). */
export function hashKey(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 2246822507);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

/** True when reviews can be computed on this device's own engine (otherwise the server's engine grades them). */
export function canReviewLocally(): boolean {
  return localEngine.usable;
}

/** A finished review already on this device (memory, then storage), with its engine results when kept. */
export async function storedReview(req: ReviewRequest): Promise<Finished | null> {
  const key = reviewKey(req.initialFen, req.moves);
  const hit = finished.get(key);
  if (hit) return hit;
  try {
    const raw = await AsyncStorage.getItem(STORE_PREFIX + hashKey(key));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { key: string; review: GameReview; evals?: PositionEval[] };
    if (saved.key !== key) return null;
    const entry = { review: saved.review, evals: saved.evals };
    remember(key, entry);
    return entry;
  } catch {
    return null;
  }
}

/** Keeps a review saved on the server on this device too, so it opens without a request next time. */
export function keepReview(req: ReviewRequest, review: GameReview) {
  const key = reviewKey(req.initialFen, req.moves);
  const entry = { review, evals: finished.get(key)?.evals };
  remember(key, entry);
  void save(key, entry);
}

/**
 * Reviews a game on this device, calling `listener` as moves are graded (in
 * game order) and once more with the finished review. A review already
 * running for the same game is joined, not started again. Returns a function
 * that stops listening; the search stops too unless it was started by
 * `prepareLocalReview` or someone else is still watching.
 */
export function reviewLocally(req: ReviewRequest, listener: Listener): () => void {
  const job = ensureJob(req, false);
  job.listeners.add(listener);
  listener(job.last);
  return () => {
    job.listeners.delete(listener);
    if (!job.keep && job.listeners.size === 0) job.ctrl.abort();
  };
}

/** Starts reviewing a game that just ended, so Review opens with most or all of it done. */
export function prepareLocalReview(req: ReviewRequest): void {
  if (req.moves.length < 2 || !localEngine.usable) return;
  ensureJob(req, true);
}

function ensureJob(req: ReviewRequest, keep: boolean): Job {
  const key = reviewKey(req.initialFen, req.moves);
  const running = jobs.get(key);
  if (running && !running.ctrl.signal.aborted) {
    running.keep ||= keep;
    return running;
  }
  const job: Job = {
    key,
    ctrl: new AbortController(),
    listeners: new Set(),
    keep,
    last: { review: null, done: 0, total: req.moves.length + 1, final: false },
  };
  jobs.set(key, job);
  const emit = (s: ReviewSnapshot) => {
    job.last = s;
    job.listeners.forEach((l) => l(s));
  };
  run(req, job, emit).finally(() => {
    if (jobs.get(key) === job) jobs.delete(key);
  });
  return job;
}

async function run(req: ReviewRequest, job: Job, emit: Listener) {
  const { moves, initialFen } = req;
  const total = moves.length + 1;
  const signal = job.ctrl.signal;
  let fens: string[];
  try {
    if (moves.length > ANALYSIS_LIMITS.maxReviewPlies) throw new Error('Game too long to review');
    const g = new Game(initialFen);
    fens = [g.fen];
    for (const m of moves) {
      if (!g.move(m)) throw new Error('Invalid move list');
      fens.push(g.fen);
    }
  } catch (e) {
    return emit({ review: null, done: 0, total, final: true, error: e instanceof Error ? e.message : 'Invalid move list' });
  }

  const saved = await storedReview(req);
  if (signal.aborted) return;
  if (saved) return emit({ review: saved.review, evals: saved.evals, done: total, total, final: true, cached: true });

  const evals: (PositionEval | undefined)[] = new Array(total);
  /** Positions searched deep in this review, or needing no search (finished positions, deep results from earlier). */
  const deep = new Set<number>();
  fens.forEach((fen, i) => {
    const term = terminalState(fen);
    const known = term ? { score: terminalScore(fen, term), pv: [], depth: 0 } : evalCache.get(positionKey(fen));
    if (!known) return;
    evals[i] = known;
    if (term || known.depth >= DEEP_REVIEW.depth) deep.add(i);
  });
  let where: ReviewSnapshot['where'] = localEngine.usable ? 'device' : 'server';
  // Progress, in quick searches: one per position, plus DEEP_COST per deep search.
  let quickDone = evals.reduce((n, e) => (e ? n + 1 : n), 0);
  let deepDone = 0;
  /** Deep searches still to come; null until the quick pass has said which (then estimated). */
  let deepLeft: number | null = null;
  /** False once no deeper searches will come (device engine gone or stalled): every graded move is then final. */
  let deepening = localEngine.usable;
  const work = () => {
    const left = deepLeft ?? Math.ceil(DEEP_SHARE_GUESS * (total - deep.size));
    return { done: quickDone + DEEP_COST * deepDone, total: total + DEEP_COST * (deepDone + (deepening ? left : 0)) };
  };

  // Partial review, rebuilt at most every EMIT_MS: the graded prefix, shown up
  // to the first move that still waits for a deeper search.
  let prefix = 0;
  let graded: GameReview | null = null;
  let dirty = true;
  /** Lowest position whose result changed since `graded` was built: its moves are graded again. */
  let staleFrom = Infinity;
  /** Grades `plies` moves, keeping the grades from `graded` that no changed result touches. */
  const regrade = (plies: number): GameReview => {
    // Move i is graded from positions i and i + 1.
    const keep = graded && { ...graded, moves: graded.moves.slice(0, Math.max(0, Math.min(graded.moves.length, staleFrom - 1))) };
    const review = buildReview(initialFen, moves.slice(0, plies), evals.slice(0, plies + 1) as PositionEval[], keep);
    graded = review;
    staleFrom = Infinity;
    dirty = false;
    return review;
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastEmit = 0;
  let shownBefore = 0;
  const flush = () => {
    timer = null;
    if (signal.aborted) return;
    while (prefix < total && evals[prefix]) prefix++;
    const plies = Math.max(0, prefix - 1);
    if (plies > 0 && dirty) {
      try {
        // Grades only the moves new or changed since the last partial review.
        regrade(plies);
      } catch {
        // Keep the previous partial result.
      }
    }
    let shown = 0;
    for (const m of graded?.moves ?? []) {
      if (deepening && DEEPEN.has(m.judgement.classification) && !(deep.has(m.ply - 1) && deep.has(m.ply))) break;
      shown++;
    }
    // Never fewer moves than already shown (a deep result can make a shown move worth a deeper look too).
    shown = Math.min(graded?.moves.length ?? 0, Math.max(shown, shownBefore));
    shownBefore = shown;
    let review: GameReview | null = null;
    if (graded && shown === graded.moves.length) review = graded;
    else if (graded && shown > 0) review = buildReview(initialFen, moves.slice(0, shown), evals.slice(0, shown + 1) as PositionEval[], graded);
    lastEmit = Date.now();
    emit({ review, ...work(), final: false, where });
  };
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(flush, Math.max(0, EMIT_MS - (Date.now() - lastEmit)));
  };
  flush();

  const common = { moves, signal, watched: () => job.listeners.size > 0 };
  try {
    // Pass 1: every position, quickly (the server's engine takes over if the device's can't).
    const quick = fens.map((_, i) => i).filter((i) => !evals[i]);
    if (quick.length) {
      await gradePositions(fens, quick, {
        ...common,
        search: LOCAL_REVIEW,
        server: SERVER_REVIEW,
        onEval: (i, ev) => {
          evals[i] = ev;
          if (ev.depth >= DEEP_REVIEW.depth) deep.add(i);
          cacheEval(fens[i]!, ev);
          quickDone++;
          staleFrom = Math.min(staleFrom, i);
          dirty = true;
          schedule();
        },
        onServer: () => {
          // The device's engine failed or stalled: no deep pass after this one.
          where = 'server';
          deepening = false;
          schedule();
        },
      });
    }
    // Pass 2: again, deeper, around the moves that were not plainly good. The
    // device only: when it can't (or stops answering), the quick results stand.
    deepening &&= localEngine.usable;
    for (let round = 0; deepening && round < DEEP_ROUNDS; round++) {
      const todo = positionsToDeepen(regrade(moves.length), deep);
      deepLeft = todo.length;
      if (!todo.length) break;
      schedule();
      const finished = await gradePositions(fens, todo, {
        ...common,
        search: DEEP_REVIEW,
        server: null,
        onEval: (i, ev) => {
          evals[i] = ev;
          deep.add(i);
          cacheEval(fens[i]!, ev);
          deepDone++;
          deepLeft = Math.max(0, (deepLeft ?? 1) - 1);
          staleFrom = Math.min(staleFrom, i);
          dirty = true;
          schedule();
        },
      });
      if (!finished) deepening = false;
    }
  } catch (e) {
    if (timer) clearTimeout(timer);
    // Stop the searches still queued for this game.
    job.ctrl.abort();
    if (e instanceof AbortError) return;
    return emit({ ...job.last, final: true, error: e instanceof Error ? e.message : 'Engine error' });
  }
  if (timer) clearTimeout(timer);
  const all = evals as PositionEval[];
  const review = regrade(moves.length);
  const { done } = work();
  const entry = { review, evals: all };
  remember(job.key, entry);
  void save(job.key, entry);
  emit({ review, evals: all, done, total: done, final: true, where });
  finishedListeners.forEach((l) => l(req, review, all));
}

/** The device's engines get this long to give a first result (they start up first) before the server joins in. */
const BOOT_GRACE_MS = 15_000;
/** No new result for this long while positions are left: the server joins in. */
const STALL_MS = 10_000;
/** Positions per server request: small, so progress moves a step at a time. */
const SERVER_BATCH = 2;
/** Server requests running at once for one review. */
const SERVER_WORKERS = 3;
/** Failed server requests in a row before the server is given up on. */
const SERVER_RETRIES = 3;

/** Positions to search deep: both positions of every move with a grade in DEEPEN, unless already searched deep. */
function positionsToDeepen(review: GameReview, deep: ReadonlySet<number>): number[] {
  const out = new Set<number>();
  for (const m of review.moves) {
    if (!DEEPEN.has(m.judgement.classification)) continue;
    for (const i of [m.ply - 1, m.ply]) if (!deep.has(i)) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

interface GradeOptions {
  moves: string[];
  signal: AbortSignal;
  watched: () => boolean;
  /** How the device's engine searches each position. */
  search: { depth: number; multipv: number; movetimeMs: number };
  /** How the server's engine searches, when it may take over; null: the device only. */
  server: { depth: number; movetimeMs: number } | null;
  onEval: (i: number, ev: PositionEval) => void;
  onServer?: () => void;
}

/**
 * Searches the positions `todo` (indices into `fens`), calling `onEval` for
 * each result. The device's engine takes them all first. When the server may
 * help, its engine takes over the ones still left when the device can't run
 * its engine, when it fails, or (while someone is watching the review) when it
 * stops producing results for a few seconds; then both work at once and
 * whichever answers a position first wins, so the review keeps moving instead
 * of hanging. Rejects only when neither can go on. Without the server, a
 * failed or (watched) silent device engine ends the search early instead:
 * resolves false, with some positions left unanswered.
 */
function gradePositions(fens: string[], todo: number[], o: GradeOptions): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    let left = todo.length;
    const got = new Set<number>();
    let lastResult = Date.now();
    let gotResult = false;
    let localDead = !localEngine.usable;
    let serverOn = false;
    let serverDead = !o.server;
    let serverWorkers = 0;
    let lastError: unknown = null;
    /** Device searches per position, cancelled once the server answers that position. */
    const local = new Map<number, AbortController>();
    /** Positions a server request is out for. */
    const taken = new Set<number>();

    const cleanup = () => {
      settled = true;
      clearInterval(watch);
      o.signal.removeEventListener('abort', onAbort);
      local.forEach((c) => c.abort());
      local.clear();
    };
    const fail = () => {
      if (settled) return;
      cleanup();
      if (!o.server) return resolve(false);
      reject(lastError instanceof Error ? lastError : new Error('Engine error'));
    };
    const onAbort = () => {
      if (settled) return;
      cleanup();
      reject(new AbortError());
    };
    const settle = (i: number, ev: PositionEval) => {
      if (settled || got.has(i)) return;
      got.add(i);
      lastResult = Date.now();
      gotResult = true;
      local.get(i)?.abort();
      local.delete(i);
      o.onEval(i, ev);
      if (--left === 0) {
        cleanup();
        resolve(true);
      }
    };

    // The server: a few small requests at a time, in game order.
    const nextBatch = () => {
      const out: number[] = [];
      for (const i of todo) {
        if (out.length >= SERVER_BATCH) break;
        if (!got.has(i) && !taken.has(i)) out.push(i);
      }
      return out;
    };
    const serverWorker = async (spec: NonNullable<GradeOptions['server']>) => {
      serverWorkers++;
      let failures = 0;
      while (!settled) {
        const batch = nextBatch();
        if (!batch.length) break;
        batch.forEach((i) => taken.add(i));
        try {
          const res = await evaluateOnServer(
            batch.map((i) => fens[i]!),
            spec,
          );
          failures = 0;
          batch.forEach((i, k) => settle(i, res[k]!));
        } catch (e) {
          batch.forEach((i) => taken.delete(i));
          lastError = e;
          if (settled || !isTransient(e) || ++failures > SERVER_RETRIES) break;
          await new Promise((r) => setTimeout(r, 500 * 2 ** failures));
        }
      }
      serverWorkers--;
      if (settled || serverWorkers > 0 || left === 0) return;
      serverDead = true;
      if (localDead) fail();
    };
    const startServer = () => {
      if (serverOn || settled) return;
      if (!o.server) return fail();
      serverOn = true;
      o.onServer?.();
      for (let k = 0; k < SERVER_WORKERS; k++) void serverWorker(o.server);
    };

    // The device: every position goes to its engine queue at once.
    const localFailed = (e: unknown) => {
      if (settled || e instanceof AbortError || localDead) return;
      localDead = true;
      lastError = e;
      if (serverDead) fail();
      else startServer();
    };
    const startLocal = async () => {
      let lanes: number;
      try {
        lanes = await localEngine.engines();
      } catch (e) {
        return localFailed(e);
      }
      if (settled) return;
      // Each engine takes one stretch of the positions and walks it backwards:
      // every search then starts from what the engine just learned about the
      // position after it (its hash table), which makes the same depth
      // noticeably more accurate. The engines also get the moves that led to
      // each position, so they see repetitions.
      const per = Math.ceil(todo.length / lanes);
      for (let lane = 0; lane < lanes; lane++) {
        for (const i of todo.slice(lane * per, (lane + 1) * per).reverse()) {
          const fen = fens[i]!;
          const ctrl = new AbortController();
          local.set(i, ctrl);
          localEngine
            .search(fen, { ...o.search, signal: ctrl.signal, lane, history: { start: fens[0]!, moves: o.moves.slice(0, i) } })
            .then((res) => settle(i, positionEvalFrom(fen, res.lines.get(1) ?? null, res.bestMove ?? undefined, res.lines.get(2) ?? null)), localFailed);
        }
      }
    };

    // Watches for a device engine that has gone quiet.
    const watch = setInterval(() => {
      if (settled || serverOn || localDead || !o.watched()) return;
      if (Date.now() - lastResult > (gotResult ? STALL_MS : BOOT_GRACE_MS)) startServer();
    }, 500);

    if (o.signal.aborted) return onAbort();
    o.signal.addEventListener('abort', onAbort, { once: true });
    if (!todo.length) {
      cleanup();
      return resolve(true);
    }
    if (localDead) startServer();
    else void startLocal();
  });
}

/**
 * One position on the device, ahead of any review in the queue: for grading
 * the player's own line on the review board. Falls back to the server's
 * engine when the device can't run one.
 */
export async function analyzeLocally(fen: string, o: { depth: number; signal?: AbortSignal }): Promise<PositionAnalysis> {
  const term = terminalState(fen);
  if (term) return { fen, depth: 0, lines: [], terminal: term };
  if (localEngine.usable) {
    try {
      const res = await localEngine.search(fen, { depth: o.depth, multipv: 2, movetimeMs: 1500, urgent: true, signal: o.signal });
      const lines = [...res.lines.values()]
        .map((info) => lineFromInfo(fen, info))
        .filter((l): l is EngineLine => !!l)
        .sort((a, b) => a.multipv - b.multipv);
      return { fen, depth: lines[0]?.depth ?? 0, lines };
    } catch (e) {
      if (e instanceof AbortError || o.signal?.aborted) throw e;
    }
  }
  const [ev] = await evaluateOnServer([fen], { depth: o.depth, movetimeMs: 1500 });
  if (o.signal?.aborted) throw new AbortError();
  if (!ev?.pv.length) return { fen, depth: ev?.depth ?? 0, lines: [] };
  return { fen, depth: ev.depth, lines: [{ multipv: 1, depth: ev.depth, score: ev.score, pv: ev.pv, san: pvToSan(fen, ev.pv) }] };
}

function cacheEval(fen: string, ev: PositionEval) {
  const k = positionKey(fen);
  const had = evalCache.get(k);
  // Keep the deeper result.
  if (had && had.depth > ev.depth) ev = had;
  evalCache.delete(k);
  evalCache.set(k, ev);
  if (evalCache.size > MAX_EVALS) evalCache.delete(evalCache.keys().next().value!);
}

function remember(key: string, entry: Finished) {
  finished.delete(key);
  finished.set(key, entry);
  if (finished.size > MAX_FINISHED) finished.delete(finished.keys().next().value!);
}

/** Engine lines are cut to this many moves when kept (only the first few are shown or sent). */
const KEEP_PV = 8;

async function save(key: string, entry: Finished) {
  try {
    const id = hashKey(key);
    const index: string[] = JSON.parse((await AsyncStorage.getItem(STORE_INDEX)) ?? '[]');
    const next = [...index.filter((k) => k !== id), id];
    const drop = next.splice(0, Math.max(0, next.length - MAX_STORED));
    const evals = entry.evals?.map((e) => ({ ...e, pv: e.pv.slice(0, KEEP_PV) }));
    await AsyncStorage.setItem(STORE_PREFIX + id, JSON.stringify({ key, review: entry.review, evals }));
    await AsyncStorage.setItem(STORE_INDEX, JSON.stringify(next));
    if (drop.length) await AsyncStorage.multiRemove(drop.map((k) => STORE_PREFIX + k));
  } catch {
    // Storage full or unavailable: the review is still kept for this session.
  }
}
