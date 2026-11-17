import { goCommand, parseBestMove, parseInfoLine, toWhitePov, type Color, type Score } from '@chessmate/core';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

/** Engine verdict for one position. `score` is from White's point of view. */
export interface PositionEval {
  bestMove: string | null;
  score: Score;
}

/** Anything that can evaluate a position: a local UCI binary, a remote pool, or a test fake. */
export interface Analyzer {
  analyze(fen: string): Promise<PositionEval>;
  close?(): Promise<void>;
}

export interface UciEngineOptions {
  path: string;
  /** Search limit per position. Fair-play analysis needs consistency more than depth. */
  depth?: number;
  movetimeMs?: number;
  threads?: number;
  hashMb?: number;
}

/**
 * Drives a UCI engine (e.g. Stockfish) as a child process, one search at a
 * time. Searches are queued so callers can fire analyses concurrently.
 */
export class UciEngine implements Analyzer {
  private proc: ChildProcessWithoutNullStreams;
  private lineHandler: ((line: string) => void) | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private ready: Promise<void>;
  private dead: Error | null = null;

  constructor(private readonly opts: UciEngineOptions) {
    this.proc = spawn(opts.path, [], { stdio: 'pipe' });
    this.proc.on('error', (e) => (this.dead = e));
    this.proc.on('exit', () => (this.dead ??= new Error('Engine exited')));
    createInterface({ input: this.proc.stdout }).on('line', (l) => this.lineHandler?.(l));
    this.ready = this.handshake();
  }

  private send(cmd: string) {
    this.proc.stdin.write(cmd + '\n');
  }

  private until(pred: (line: string) => boolean, onLine?: (line: string) => void, timeoutMs = 60_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineHandler = null;
        reject(new Error('Engine timed out'));
      }, timeoutMs);
      this.lineHandler = (line) => {
        onLine?.(line);
        if (pred(line)) {
          clearTimeout(timer);
          this.lineHandler = null;
          resolve(line);
        }
      };
    });
  }

  private async handshake() {
    const ok = this.until((l) => l === 'uciok');
    this.send('uci');
    await ok;
    this.send(`setoption name Threads value ${this.opts.threads ?? 1}`);
    this.send(`setoption name Hash value ${this.opts.hashMb ?? 64}`);
    const ready = this.until((l) => l === 'readyok');
    this.send('isready');
    await ready;
  }

  analyze(fen: string): Promise<PositionEval> {
    const run = async (): Promise<PositionEval> => {
      await this.ready;
      if (this.dead) throw this.dead;
      const side = (fen.split(' ')[1] ?? 'w') as Color;
      let score: Score | undefined;
      const done = this.until(
        (l) => l.startsWith('bestmove'),
        (l) => {
          const info = parseInfoLine(l);
          if (info?.score && !info.bound && (info.multipv ?? 1) === 1) score = info.score;
        },
      );
      this.send(`position fen ${fen}`);
      this.send(goCommand({ depth: this.opts.depth ?? (this.opts.movetimeMs ? undefined : 14), movetimeMs: this.opts.movetimeMs }));
      const best = parseBestMove(await done)?.best ?? null;
      return {
        bestMove: best && best !== '(none)' ? best : null,
        score: toWhitePov(score ?? { cp: 0 }, side),
      };
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  async close() {
    if (this.dead) return;
    this.send('quit');
    await new Promise<void>((r) => {
      const t = setTimeout(() => {
        this.proc.kill();
        r();
      }, 1000);
      this.proc.once('exit', () => {
        clearTimeout(t);
        r();
      });
    });
  }
}

/** Builds the analyzer from env: STOCKFISH_PATH, FAIRPLAY_ENGINE_DEPTH. Null when no engine is configured. */
export function analyzerFromEnv(env: NodeJS.ProcessEnv = process.env): Analyzer | null {
  const path = env.STOCKFISH_PATH;
  if (!path) return null;
  return new UciEngine({ path, depth: Number(env.FAIRPLAY_ENGINE_DEPTH) || 14 });
}
