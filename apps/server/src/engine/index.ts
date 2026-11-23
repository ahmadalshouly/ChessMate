import { AnalysisService, type AnalysisServiceOptions } from './analysisService';
import { EnginePool } from './pool';
import { UciEngine, resolveEngineCommand } from './uciEngine';

export { AnalysisService } from './analysisService';
export { EnginePool } from './pool';
export { UciEngine, resolveEngineCommand, type Engine, type SearchOptions, type SearchResult } from './uciEngine';

/**
 * Analysis backed by Stockfish processes, configured from the environment:
 * STOCKFISH_PATH (native binary), ENGINE_WORKERS (processes, default 1),
 * ENGINE_THREADS and ENGINE_HASH_MB (per process). It serves the analysis
 * board and broadcast evaluations; game reviews run on players' devices.
 */
export function createAnalysisService(env: NodeJS.ProcessEnv = process.env, opts: AnalysisServiceOptions = {}) {
  const cmd = resolveEngineCommand(env);
  const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const pool = new EnginePool(
    () => UciEngine.start(cmd, { threads: num(env.ENGINE_THREADS), hashMb: num(env.ENGINE_HASH_MB) }),
    Math.max(1, num(env.ENGINE_WORKERS) ?? 1),
  );
  const service = new AnalysisService(pool, opts);
  return { service, engine: cmd.label };
}
