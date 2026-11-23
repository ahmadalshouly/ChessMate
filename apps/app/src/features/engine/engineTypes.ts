/** Shared by every platform's transport (kept apart from transport.ts, which Metro swaps per platform). */

/** To the engine farm (see farmSource.ts). */
export type FarmIn =
  | { t: 'search'; id: number; fen: string; depth: number; multipv: number; movetime?: number; urgent?: boolean }
  | { t: 'cancel'; id: number };

/** From the engine farm. */
export type FarmOut =
  | { t: 'ready'; size: number }
  | { t: 'result'; id: number; lines: string[]; best: string | null }
  | { t: 'cancelled'; id: number }
  | { t: 'error'; message: string };

export interface EngineTransport {
  /** Engines searching side by side. */
  size: number;
  send(msg: FarmIn): void;
  /** Stops every engine and frees its memory. */
  dispose(): void;
}

export type FarmHandler = (msg: FarmOut) => void;

/** Engines to run side by side: one per spare core, at most `max`. */
export function engineCount(cores: number | undefined, max: number): number {
  return Math.max(1, Math.min(max, (cores || 2) - 1));
}
