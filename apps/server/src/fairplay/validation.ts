import type { ClientMessage } from '@chessmate/core';

/**
 * Strict shape checks for every client message. The game room is the
 * authority on chess legality; this layer makes sure nothing malformed,
 * oversized or of the wrong type ever reaches it.
 */
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const GAME_ID = /^[\w-]{1,64}$/;
const MAX_PLY = 2000;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isGameId = (v: unknown): v is string => typeof v === 'string' && GAME_ID.test(v);

export function isValidUci(v: unknown): v is string {
  return typeof v === 'string' && UCI.test(v);
}

/** Returns null when the message is well-formed, otherwise a short reason. */
export function validateClientMessage(m: ClientMessage): string | null {
  const msg = m as unknown as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      return isInt(msg.v, 0, 1000) && typeof msg.token === 'string' && msg.token.length <= 4096 ? null : 'Invalid hello';
    case 'ping':
      return isInt(msg.id, 0, Number.MAX_SAFE_INTEGER) ? null : 'Invalid ping';
    case 'seek': {
      if (!isObj(msg.timeControl) || typeof msg.rated !== 'boolean') return 'Invalid seek';
      const r = msg.ratingRange;
      if (r === undefined) return null;
      return Array.isArray(r) && r.length === 2 && isInt(r[0], 0, 4000) && isInt(r[1], 0, 4000) && r[0] <= r[1]
        ? null
        : 'Invalid rating range';
    }
    case 'cancelSeek':
      return null;
    case 'move':
      if (!isGameId(msg.gameId)) return 'Invalid game id';
      if (!isValidUci(msg.uci)) return 'Invalid move format';
      if (!isInt(msg.ply, 0, MAX_PLY)) return 'Invalid ply';
      return null;
    case 'join':
    case 'resign':
    case 'offerDraw':
    case 'acceptDraw':
    case 'declineDraw':
    case 'abort':
      return isGameId(msg.gameId) ? null : 'Invalid game id';
    default:
      return 'Unknown message';
  }
}
