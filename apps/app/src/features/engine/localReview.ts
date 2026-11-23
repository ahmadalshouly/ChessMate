import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ANALYSIS_LIMITS,
  Game,
  buildReview,
  lineFromInfo,
  positionEvalFrom,
  positionKey,
  terminalScore,
  terminalState,
  type EngineLine,
  type GameReview,
  type PositionAnalysis,
  type PositionEval,
} from '@chessmate/core';

import { AbortError, localEngine } from './localEngine';

/**
 * Per-position search for reviews on the device. Depth 12 with two lines grades
 * moves the same as deeper searches in almost every position (measured on a
 * full game: same accuracy within a point, same blunders and best moves) at a
 * fraction of the time; the time cap stops one sharp position stalling a review.
 */
export const LOCAL_REVIEW = { depth: 12, multipv: 2, movetimeMs: 1500 } as const;

export interface ReviewSnapshot {
  /** Graded so far: the moves from the start up to the first one still being searched. */
  review: GameReview | null;
  /** Positions searched / in the game. */
  done: number;
  total: number;
  final: boolean;
  error?: string;
  /** Answered from a review already on this device, without searching. */
  cached?: boolean;
  /** Engine results per position, on the finished snapshot (absent for reviews kept from before they were saved). */
  evals?: PositionEval[];
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
  return `${LOCAL_REVIEW.depth}|${initialFen}|${moves.join(' ')}`;
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

/** True when reviews can be computed on this device. */
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
  let done = 0;
  fens.forEach((fen, i) => {
    const term = terminalState(fen);
    const known = term ? { score: terminalScore(fen, term), pv: [], depth: 0 } : evalCache.get(positionKey(fen));
    if (known) {
      evals[i] = known;
      done++;
    }
  });

  // Partial review of the graded prefix, rebuilt at most every EMIT_MS.
  let prefix = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastEmit = 0;
  const flush = () => {
    timer = null;
    if (signal.aborted) return;
    while (prefix < total && evals[prefix]) prefix++;
    const plies = Math.max(0, prefix - 1);
    let review: GameReview | null = job.last.review;
    if (plies > 0 && plies !== review?.moves.length) {
      try {
        review = buildReview(initialFen, moves.slice(0, plies), evals.slice(0, plies + 1) as PositionEval[]);
      } catch {
        // Keep the previous partial result.
      }
    }
    lastEmit = Date.now();
    emit({ review, done, total, final: false });
  };
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(flush, Math.max(0, EMIT_MS - (Date.now() - lastEmit)));
  };
  flush();

  try {
    // Every position goes to the engine queue at once, in game order; the engines
    // take them a few at a time, so moves are graded from the first one onward.
    await Promise.all(
      fens.map(async (fen, i) => {
        if (evals[i]) return;
        const res = await localEngine.search(fen, { ...LOCAL_REVIEW, signal });
        const ev = positionEvalFrom(fen, res.lines.get(1) ?? null, res.bestMove ?? undefined, res.lines.get(2) ?? null);
        evals[i] = ev;
        cacheEval(fen, ev);
        done++;
        schedule();
      }),
    );
  } catch (e) {
    if (timer) clearTimeout(timer);
    // Stop the searches still queued for this game.
    job.ctrl.abort();
    if (e instanceof AbortError) return;
    return emit({ ...job.last, final: true, error: e instanceof Error ? e.message : 'Engine error' });
  }
  if (timer) clearTimeout(timer);
  const all = evals as PositionEval[];
  const review = buildReview(initialFen, moves, all);
  const entry = { review, evals: all };
  remember(job.key, entry);
  void save(job.key, entry);
  emit({ review, evals: all, done: total, total, final: true });
  finishedListeners.forEach((l) => l(req, review, all));
}

/**
 * One position on the device, ahead of any review in the queue: for grading
 * the player's own line on the review board.
 */
export async function analyzeLocally(fen: string, o: { depth: number; signal?: AbortSignal }): Promise<PositionAnalysis> {
  const term = terminalState(fen);
  if (term) return { fen, depth: 0, lines: [], terminal: term };
  const res = await localEngine.search(fen, { depth: o.depth, multipv: 2, movetimeMs: 1500, urgent: true, signal: o.signal });
  const lines = [...res.lines.values()]
    .map((info) => lineFromInfo(fen, info))
    .filter((l): l is EngineLine => !!l)
    .sort((a, b) => a.multipv - b.multipv);
  return { fen, depth: lines[0]?.depth ?? 0, lines };
}

function cacheEval(fen: string, ev: PositionEval) {
  const k = positionKey(fen);
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
