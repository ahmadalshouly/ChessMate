import { AnalysisService, type AnalysisServiceOptions } from './analysisService';
import { EnginePool } from './pool';
import { UciEngine, resolveEngineCommand } from './uciEngine';

export { AnalysisService, reviewKey, type ReviewStore } from './analysisService';
export { EnginePool } from './pool';
export { UciEngine, resolveEngineCommand, type Engine, type SearchOptions, type SearchResult } from './uciEngine';

/**
 * Analysis backed by Stockfish processes, configured from the environment:
 * STOCKFISH_PATH (native binary), ENGINE_WORKERS (processes, default 1),
 * ENGINE_THREADS and ENGINE_HASH_MB (per process), REVIEW_DEPTH and
 * REVIEW_MOVETIME_MS (per position when reviewing games).
 */
export function createAnalysisService(env: NodeJS.ProcessEnv = process.env, opts: AnalysisServiceOptions = {}) {
  const cmd = resolveEngineCommand(env);
  const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const pool = new EnginePool(
    () => UciEngine.start(cmd, { threads: num(env.ENGINE_THREADS), hashMb: num(env.ENGINE_HASH_MB) }),
    Math.max(1, num(env.ENGINE_WORKERS) ?? 1),
  );
  const service = new AnalysisService(pool, {
    reviewDepth: num(env.REVIEW_DEPTH),
    reviewMoveTimeMs: num(env.REVIEW_MOVETIME_MS),
    ...opts,
  });
  return { service, engine: cmd.label };
}
