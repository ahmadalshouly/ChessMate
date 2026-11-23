/**
 * How the app reaches the on-device Stockfish engines. Each platform has its own
 * file (transport.web.ts, transport.native.ts); this one is the fallback for
 * anything else (tests, unknown platforms), where there is no local engine and
 * reviews go to the server as before.
 */
import type { EngineTransport, FarmHandler } from './engineTypes';

export type { EngineTransport, FarmHandler } from './engineTypes';

/** True where an on-device engine can run at all (cheap check, no loading). */
export function transportSupported(): boolean {
  return false;
}

export function openTransport(_onMessage: FarmHandler): Promise<EngineTransport> {
  return Promise.reject(new Error('No on-device engine on this platform'));
}
