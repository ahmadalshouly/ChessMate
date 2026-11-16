import { goCommand, parseBestMove, parseInfoLine, type UciInfo } from '@chessmate/core';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

/**
 * Stockfish runs as a separate operating-system process that we talk to over
 * UCI on stdin/stdout. It is never linked into our code or shipped in the
 * app, which keeps the GPL-licensed engine at arm's length.
 */

export interface SearchOptions {
  multipv: number;
  depth?: number;
  movetimeMs?: number;
}

export interface SearchResult {
  /** Latest complete info per multipv index (1-based), scores relative to side to move. */
  lines: Map<number, UciInfo>;
  bestMove: string | null;
}

/** What the analysis service needs from an engine. A fake one is used in tests. */
export interface Engine {
  search(fen: string, opts: SearchOptions, onInfo?: (info: UciInfo) => void, signal?: AbortSignal): Promise<SearchResult>;
  readonly alive: boolean;
  close(): void;
}

export interface EngineCommand {
  command: string;
  args: string[];
  /** Human readable, for logs. */
  label: string;
}

/**
 * Finds a Stockfish to run, in order:
 * 1. STOCKFISH_PATH: a native binary (used by the Docker image, fastest).
 * 2. The `stockfish` npm package (WebAssembly build run by a child Node
 *    process), so local development needs no separate install.
 * 3. `stockfish` on PATH.
 */
export function resolveEngineCommand(env: NodeJS.ProcessEnv = process.env): EngineCommand {
  const configured = env.STOCKFISH_PATH?.trim();
  if (configured) return { command: configured, args: [], label: configured };
  const wasm = findWasmEngine(env.STOCKFISH_WASM_VARIANT);
  if (wasm) return { command: process.execPath, args: [wasm], label: `stockfish (npm, ${wasm.split(/[\\/]/).pop()})` };
  return { command: 'stockfish', args: [], label: 'stockfish on PATH' };
}

function findWasmEngine(variant = 'lite-single'): string | null {
  try {
    const require = createRequire(import.meta.url);
    const root = dirname(require.resolve('stockfish/package.json'));
    const version = (require('stockfish/package.json') as { buildVersion?: string; version: string }).buildVersion ?? '';
    const candidates = [join(root, 'bin', `stockfish-${version}-${variant}.js`), join(root, 'src', `stockfish-${version}-${variant}.js`)];
    return candidates.find((p) => existsSync(p)) ?? null;
  } catch {
    return null;
  }
}

export interface UciEngineOptions {
  threads?: number;
  hashMb?: number;
  /** How long to wait for the engine to answer the UCI handshake. */
  startTimeoutMs?: number;
}

export class UciEngine implements Engine {
  private proc: ChildProcessWithoutNullStreams;
  private listeners = new Set<(line: string) => void>();
  private multipv = 1;
  private busy = false;
  alive = true;

  private constructor(cmd: EngineCommand) {
    this.proc = spawn(cmd.command, cmd.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.proc.on('exit', () => {
      this.alive = false;
      for (const l of [...this.listeners]) l('__exit__');
    });
    this.proc.on('error', () => {
      this.alive = false;
      for (const l of [...this.listeners]) l('__exit__');
    });
    this.proc.stdin.on('error', () => undefined);
    createInterface({ input: this.proc.stdout }).on('line', (line) => {
      for (const l of [...this.listeners]) l(line.trim());
    });
  }

  static async start(cmd: EngineCommand = resolveEngineCommand(), opts: UciEngineOptions = {}): Promise<UciEngine> {
    const e = new UciEngine(cmd);
    try {
      await e.until((l) => l === 'uciok', () => e.send('uci'), opts.startTimeoutMs ?? 20_000);
      if (opts.threads) e.send(`setoption name Threads value ${opts.threads}`);
      if (opts.hashMb) e.send(`setoption name Hash value ${opts.hashMb}`);
      await e.ready();
    } catch (err) {
      e.close();
      throw new Error(`Could not start ${cmd.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return e;
  }

  private send(line: string) {
    if (this.alive) this.proc.stdin.write(`${line}\n`);
  }

  /** Waits for a line matching `match`, after running `kick`. */
  private until(match: (line: string) => boolean, kick: () => void, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => done(new Error('engine timed out')), timeoutMs);
      const listener = (line: string) => {
        if (line === '__exit__') return done(new Error('engine exited'));
        if (match(line)) done(null, line);
      };
      const done = (err: Error | null, line?: string) => {
        clearTimeout(timer);
        this.listeners.delete(listener);
        if (err) reject(err);
        else resolve(line!);
      };
      if (!this.alive) return done(new Error('engine is not running'));
      this.listeners.add(listener);
      kick();
    });
  }

  private ready() {
    return this.until((l) => l === 'readyok', () => this.send('isready'), 10_000);
  }

  async search(fen: string, opts: SearchOptions, onInfo?: (info: UciInfo) => void, signal?: AbortSignal): Promise<SearchResult> {
    if (this.busy) throw new Error('engine is busy');
    this.busy = true;
    try {
      if (opts.multipv !== this.multipv) {
        this.send(`setoption name MultiPV value ${opts.multipv}`);
        this.multipv = opts.multipv;
      }
      await this.ready();
      const lines = new Map<number, UciInfo>();
      const onAbort = () => this.send('stop');
      signal?.addEventListener('abort', onAbort, { once: true });
      // Generous timeout: movetime plus slack, or a hard cap for depth-only searches.
      const timeout = (opts.movetimeMs ?? 60_000) + 15_000;
      try {
        const last = await this.until(
          (line) => {
            if (line.startsWith('info ')) {
              const info = parseInfoLine(line);
              if (info?.pv?.length && info.score && !info.bound) {
                lines.set(info.multipv ?? 1, info);
                onInfo?.(info);
              }
              return false;
            }
            return line.startsWith('bestmove');
          },
          () => {
            this.send(`position fen ${fen}`);
            this.send(goCommand({ depth: opts.depth, movetimeMs: opts.movetimeMs }));
            if (signal?.aborted) this.send('stop');
          },
          timeout,
        );
        const best = parseBestMove(last)?.best;
        return { lines, bestMove: best && best !== '(none)' ? best : null };
      } catch (err) {
        // A hung engine is not reusable; the pool replaces it.
        this.close();
        throw err;
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    } finally {
      this.busy = false;
    }
  }

  close() {
    if (!this.alive) return;
    this.send('quit');
    const proc = this.proc;
    setTimeout(() => proc.exitCode === null && proc.kill(), 500).unref();
    this.alive = false;
  }
}
