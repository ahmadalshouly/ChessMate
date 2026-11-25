import { BOTS, Game, botEngine, type OnlineBot } from '@chessmate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FARM_SOURCE } from '../src/features/engine/farmSource';

// A device engine the test controls.
const device = vi.hoisted(() => ({
  usable: true,
  fail: false,
  calls: [] as { depth: number; movetimeMs?: number; elo?: number; urgent?: boolean; moves: string[] }[],
}));

vi.mock('../src/features/engine/localEngine', () => {
  class AbortError extends Error {
    constructor() {
      super('Aborted');
      this.name = 'AbortError';
    }
  }
  return {
    AbortError,
    localEngine: {
      get usable() {
        return device.usable;
      },
      search: (_fen: string, o: { depth: number; movetimeMs?: number; elo?: number; urgent?: boolean; history?: { moves: string[] }; signal?: AbortSignal }) => {
        device.calls.push({ depth: o.depth, movetimeMs: o.movetimeMs, elo: o.elo, urgent: o.urgent, moves: o.history?.moves ?? [] });
        if (device.fail) return Promise.reject(new Error('Engine stopped'));
        return new Promise((resolve, reject) => {
          if (o.signal?.aborted) return reject(new AbortError());
          o.signal?.addEventListener('abort', () => reject(new AbortError()), { once: true });
          // Any legal move will do: the first one the rules give.
          const g = Game.fromUciMoves(o.history?.moves ?? []);
          const m = g.legalMoves()[0]!;
          setTimeout(() => resolve({ lines: new Map(), bestMove: m.from + m.to + (m.promotion ?? '') }), 1);
        });
      },
    },
  };
});
vi.mock('../src/lib/config', () => ({ API_URL: 'https://api.example' }));
vi.mock('../src/lib/social/api', () => ({ apiRequest: async () => ({}) }));

const { botMove } = await import('../src/features/bots/botMove');
const { allOpponents, byBand, defaultOpponent, onlineBotId, onlineOpponent, BUILTIN_OPPONENTS } = await import('../src/features/bots/opponents');

/** A position no repertoire covers, so the engine has to think. */
const OFF_BOOK = ['a2a3', 'h7h6', 'h2h3', 'a7a6'];

beforeEach(() => {
  device.usable = true;
  device.fail = false;
  device.calls = [];
});

describe('computer opponent moves', () => {
  it('plays Stockfish at its strength limit from 1320 to 3190', async () => {
    const m = await botMove({ rating: 1800, style: 'balanced' }, OFF_BOOK);
    expect(m.source).toBe('stockfish');
    expect(Game.fromUciMoves(OFF_BOOK).isLegal(m.uci)).toBe(true);
    const plan = botEngine(1800);
    expect(device.calls).toEqual([{ depth: plan.depth, movetimeMs: plan.kind === 'stockfish' ? plan.movetimeMs : -1, elo: 1800, urgent: true, moves: OFF_BOOK }]);
  });

  it('plays Stockfish at full strength above that', async () => {
    const m = await botMove({ rating: 3500, style: 'balanced' }, OFF_BOOK);
    expect(m.source).toBe('stockfish');
    expect(device.calls[0]!.elo).toBeUndefined();
  });

  it('keeps the small search for bots below 1320, without starting Stockfish', async () => {
    const m = await botMove({ rating: 800, style: 'balanced' }, OFF_BOOK);
    expect(m.source).toBe('core');
    expect(device.calls).toEqual([]);
  });

  it('opens from its repertoire without asking the engine', async () => {
    const m = await botMove({ rating: 2600, style: 'solid' }, []);
    expect(m).toEqual({ uci: 'd2d4', source: 'book' });
    expect(device.calls).toEqual([]);
  });

  it('falls back to the small search when Stockfish fails or cannot run here', async () => {
    device.fail = true;
    expect((await botMove({ rating: 2400, style: 'balanced' }, OFF_BOOK)).source).toBe('fallback');
    device.fail = false;
    device.usable = false;
    const m = await botMove({ rating: 2400, style: 'balanced' }, OFF_BOOK);
    expect(m.source).toBe('fallback');
    expect(Game.fromUciMoves(OFF_BOOK).isLegal(m.uci)).toBe(true);
  });

  it('stops when the game no longer wants the move', async () => {
    const abort = new AbortController();
    const p = botMove({ rating: 2000, style: 'balanced' }, OFF_BOOK, { signal: abort.signal });
    abort.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('opponent list', () => {
  const online: OnlineBot[] = [
    { id: 'a1', name: 'Captain Rook', tagline: 'Live on Fridays', rating: 2400, style: 'aggressive', tag: 'streamer', url: 'https://twitch.tv/x', avatar: '/api/bots/a1/avatar?v=1', featured: true },
    { id: 'b2', name: 'quiet queen', tagline: null, rating: 1000, style: 'solid', tag: null, url: null, avatar: 'https://cdn.example/q.png', featured: false },
  ];

  it('puts online bots into their rating band next to the built-in ones', () => {
    const all = allOpponents(online);
    expect(all).toHaveLength(BOTS.length + 2);
    for (let i = 1; i < all.length; i++) expect(all[i]!.rating).toBeGreaterThanOrEqual(all[i - 1]!.rating);
    const groups = byBand(all);
    expect(groups.find((g) => g.band.id === 'master')!.opponents.some((o) => o.name === 'Captain Rook')).toBe(true);
    // At the same rating as Marlow, the online bot comes first.
    const novice = groups.find((g) => g.band.id === 'novice')!.opponents;
    expect(novice.findIndex((o) => o.name === 'quiet queen')).toBeLessThan(novice.findIndex((o) => o.id === 'marlow'));
  });

  it('keeps online ids apart from built-in ones and makes picture paths absolute', () => {
    const rook = onlineOpponent(online[0]!);
    expect(rook.id).toBe('online:a1');
    expect(onlineBotId(rook)).toBe('a1');
    expect(onlineBotId(BUILTIN_OPPONENTS[0]!)).toBeNull();
    expect(rook.avatar).toBe('https://api.example/api/bots/a1/avatar?v=1');
    expect(onlineOpponent(online[1]!)).toMatchObject({ avatar: 'https://cdn.example/q.png', initial: 'Q', band: 'novice' });
  });

  it('starts players near their own rating', () => {
    expect(defaultOpponent(null).id).toBe('marlow');
    expect(defaultOpponent(1480).id).toBe('quill');
    expect(defaultOpponent(5000).id).toBe('zenith');
  });
});

describe('engine farm strength limit', () => {
  type Engine = { postMessage: (cmd: string) => void; sent: string[] };
  const createFarm = new Function(`${FARM_SOURCE}; return createFarm;`)() as (
    make: (onLine: (l: string) => void, onError: (m: string) => void) => Engine,
    size: number,
    post: (m: { t: string }) => void,
  ) => (m: unknown) => void;

  function farm() {
    const engines: Engine[] = [];
    const out: { t: string }[] = [];
    const send = createFarm(
      (onLine) => {
        const e: Engine = {
          sent: [],
          postMessage(cmd) {
            e.sent.push(cmd);
            if (cmd === 'uci') setTimeout(() => onLine('uciok'));
            if (cmd === 'isready') setTimeout(() => onLine('readyok'));
            if (cmd.startsWith('go')) setTimeout(() => onLine('bestmove e2e4'));
          },
        };
        engines.push(e);
        return e;
      },
      1,
      (m) => out.push(m),
    );
    return { send, engines, out };
  }
  const tick = () => new Promise((r) => setTimeout(r, 5));

  it('limits strength only for the searches that ask, and resets it for the next one', async () => {
    const f = farm();
    await tick();
    f.send({ t: 'search', id: 1, fen: 'startpos', depth: 8, multipv: 1, elo: 1600 });
    await tick();
    f.send({ t: 'search', id: 2, fen: 'startpos', depth: 8, multipv: 1, elo: 1600 });
    await tick();
    f.send({ t: 'search', id: 3, fen: 'startpos', depth: 8, multipv: 1 });
    await tick();
    const sent = f.engines[0]!.sent.filter((c) => c.startsWith('setoption name UCI') || c.startsWith('go'));
    expect(sent).toEqual([
      'setoption name UCI_LimitStrength value true',
      'setoption name UCI_Elo value 1600',
      'go depth 8',
      // Same strength again: nothing to change.
      'go depth 8',
      // A review search: back to full strength.
      'setoption name UCI_LimitStrength value false',
      'go depth 8',
    ]);
    expect(f.out.filter((m) => m.t === 'result')).toHaveLength(3);
  });
});
