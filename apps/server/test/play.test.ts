import { decodeServer, encode, type ClientMessage, type ServerMessage } from '@chessmate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { Matchmaker } from '../src/matchmaker';
import { ChessServer } from '../src/server';

let server: ChessServer;
let port: number;

beforeAll(async () => {
  server = new ChessServer({ port: 0, matchIntervalMs: 20, reconnectGraceMs: 300 });
  port = await server.listen();
});
afterAll(() => server.close());

type Client = Awaited<ReturnType<typeof client>>;

function client(token: string) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox: ServerMessage[] = [];
  const waiters: [(m: ServerMessage) => boolean, (m: ServerMessage) => void][] = [];
  ws.on('message', (d) => {
    const m = decodeServer(String(d))!;
    const w = waiters.find((x) => x[0](m));
    if (w) {
      waiters.splice(waiters.indexOf(w), 1);
      w[1](m);
    } else inbox.push(m);
  });
  const api = {
    send: (m: ClientMessage) => ws.send(encode(m)),
    next: <T extends ServerMessage['t']>(t: T, pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true) =>
      new Promise<Extract<ServerMessage, { t: T }>>((res, rej) => {
        const match = (m: ServerMessage) => m.t === t && pred(m as never);
        const found = inbox.find(match);
        if (found) {
          inbox.splice(inbox.indexOf(found), 1);
          return res(found as never);
        }
        const timer = setTimeout(() => rej(new Error(`timeout waiting for ${t}`)), 2000);
        waiters.push([match, (m) => (clearTimeout(timer), res(m as never))]);
      }),
    close: () => ws.close(),
  };
  return new Promise<typeof api>((res) =>
    ws.on('open', () => {
      api.send({ t: 'hello', v: 1, token });
      res(api);
    }),
  );
}

const tc = { initialMs: 120_000, incrementMs: 1_000 };

async function pairViaOpenGame(a: Client, b: Client) {
  a.send({ t: 'createOpenGame', timeControl: tc, rated: false, color: 'w' });
  const created = await a.next('openGameCreated');
  b.send({ t: 'joinOpenGame', id: created.game.id });
  const [sa, sb] = await Promise.all([a.next('gameStart'), b.next('gameStart')]);
  return { sa, sb };
}

describe('lobby and open games', () => {
  it('lists open games to lobby subscribers and starts the game on join with the chosen colour', async () => {
    const a = await client('guest:Host');
    const b = await client('guest:Joiner');
    await Promise.all([a.next('welcome'), b.next('welcome')]);
    b.send({ t: 'lobbySub' });
    await b.next('lobby');
    a.send({ t: 'createOpenGame', timeControl: tc, rated: true, color: 'b' });
    const created = await a.next('openGameCreated');
    expect(created.game.rated).toBe(false); // guests cannot play rated
    const lobby = await b.next('lobby', (m) => m.lobby.openGames.some((g) => g.id === created.game.id));
    expect(lobby.lobby.openGames[0]!.by.name).toBe('Host');
    b.send({ t: 'joinOpenGame', id: created.game.id });
    const sa = await a.next('gameStart');
    expect(sa.you).toBe('b');
    await b.next('lobby', (m) => m.lobby.openGames.length === 0);
    a.close();
    b.close();
  });

  it('quick-pairs with the requested colour and sends the first-move deadline', async () => {
    const a = await client('guest:WantsBlack');
    const b = await client('guest:AnySide');
    await Promise.all([a.next('welcome'), b.next('welcome')]);
    const quick = { initialMs: 180_000, incrementMs: 2_000 };
    a.send({ t: 'seek', timeControl: quick, rated: false, color: 'b' });
    b.send({ t: 'seek', timeControl: quick, rated: false, color: 'random' });
    const [sa, sb] = await Promise.all([a.next('gameStart'), b.next('gameStart')]);
    expect(sa.you).toBe('b');
    expect(sb.you).toBe('w');
    expect(sa.game.firstMoveDeadline).toBeGreaterThan(sa.game.serverNow);
    b.send({ t: 'move', gameId: sb.game.gameId, uci: 'e2e4', ply: 0 });
    const moved = await a.next('moved');
    expect(moved.firstMoveDeadline).toBeGreaterThanOrEqual(moved.serverNow);
    a.send({ t: 'move', gameId: sa.game.gameId, uci: 'e7e5', ply: 1 });
    expect((await b.next('moved', (m) => m.ply === 2)).firstMoveDeadline).toBeNull();
    a.send({ t: 'resign', gameId: sa.game.gameId });
    await a.next('gameOver');
    a.close();
    b.close();
  });

  it('reports the widening rating window while seeking', async () => {
    const a = await client('guest:Seeker');
    await a.next('welcome');
    a.send({ t: 'seek', timeControl: { initialMs: 60_000, incrementMs: 1_000 }, rated: false, range: 300 });
    await a.next('seeking');
    const st = await a.next('seekStatus');
    // New guests are provisional (high RD), so their window starts wide; the fixed range caps it.
    expect(st.window).toBe(300);
    expect(st.poolSize).toBe(0);
    a.send({ t: 'cancelSeek' });
    await a.next('seekCancelled');
    a.close();
  });
});

describe('reconnect, abandonment and rematch', () => {
  it('resumes a game with the guest resume token', async () => {
    const a = await client('guest:Dropper');
    const b = await client('guest:Stayer');
    const wa = await a.next('welcome');
    await b.next('welcome');
    expect(wa.resumeToken).toMatch(/^guest-resume:/);
    const { sa } = await pairViaOpenGame(a, b);
    a.send({ t: 'move', gameId: sa.game.gameId, uci: 'e2e4', ply: 0 });
    await b.next('moved');
    a.close();
    const off = await b.next('opponentConnection', (m) => !m.connected);
    expect(off.abandonAt).toBeGreaterThan(Date.now());
    const a2 = await client(wa.resumeToken!);
    const resumed = await a2.next('gameStart');
    expect(resumed.game.gameId).toBe(sa.game.gameId);
    expect(resumed.game.moves).toEqual(['e2e4']);
    await b.next('opponentConnection', (m) => m.connected);
    a2.close();
    b.close();
  });

  it('rejects a forged resume token', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise((r) => ws.on('open', r));
    ws.send(encode({ t: 'hello', v: 1, token: 'guest-resume:g_x:nope' }));
    const code = await new Promise<number>((r) => ws.on('close', (c) => r(c)));
    expect(code).toBe(4003);
  });

  it('forfeits a player who does not come back after moves were made', async () => {
    const a = await client('guest:Leaver');
    const b = await client('guest:Waiter');
    await Promise.all([a.next('welcome'), b.next('welcome')]);
    const { sa } = await pairViaOpenGame(a, b);
    const id = sa.game.gameId;
    a.send({ t: 'move', gameId: id, uci: 'e2e4', ply: 0 });
    await b.next('moved');
    b.send({ t: 'move', gameId: id, uci: 'e7e5', ply: 1 });
    await b.next('moved', (m) => m.ply === 2);
    a.close();
    const over = await b.next('gameOver');
    expect(over.outcome).toMatchObject({ reason: 'abandoned', winner: 'b' });
    b.close();
  });

  it('starts a rematch with colours swapped when both players ask', async () => {
    const a = await client('guest:R1');
    const b = await client('guest:R2');
    await Promise.all([a.next('welcome'), b.next('welcome')]);
    const { sa } = await pairViaOpenGame(a, b);
    const id = sa.game.gameId;
    a.send({ t: 'resign', gameId: id });
    await Promise.all([a.next('gameOver'), b.next('gameOver')]);
    a.send({ t: 'rematch', gameId: id });
    const offer = await b.next('rematchOffered');
    expect(offer.by).toBe('w');
    b.send({ t: 'rematch', gameId: id });
    const [ra, rb] = await Promise.all([a.next('gameStart'), b.next('gameStart')]);
    expect(ra.you).toBe('b');
    expect(rb.you).toBe('w');
    expect(ra.game.gameId).not.toBe(id);
    a.close();
    b.close();
  });
});

describe('Matchmaker window', () => {
  const seek = (playerId: string, rating: number, extra = {}) => ({
    playerId,
    rating,
    timeControl: tc,
    rated: true,
    createdAt: 0,
    ...extra,
  });

  it('widens over time, then opens fully unless a range is fixed', () => {
    const m = new Matchmaker({ baseGap: 100, gapPerSecond: 20, maxGap: 600, openAfterMs: 45_000 });
    expect(m.allowedGap(seek('a', 1500), 0)).toBe(100);
    expect(m.allowedGap(seek('a', 1500), 10_000)).toBe(300);
    expect(m.allowedGap(seek('a', 1500), 30_000)).toBe(600);
    expect(m.allowedGap(seek('a', 1500), 45_000)).toBe(Infinity);
    expect(m.allowedGap(seek('a', 1500, { range: 200 }), 60_000)).toBe(200);
  });

  it('pairs distant ratings only once both windows are wide enough', () => {
    const m = new Matchmaker();
    m.add(seek('a', 1500));
    m.add(seek('b', 1800));
    expect(m.tick(1_000)).toHaveLength(0);
    expect(m.tick(11_000)).toHaveLength(1);
  });
});
