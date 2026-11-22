/**
 * Load test: many simulated players connect, get paired and play real games
 * (random legal moves) against each other, then the script reports how fast
 * the server answered. Run it against a production build, never production.
 *
 *   pnpm --filter @chessmate/server loadtest -- --url ws://localhost:8080/ws --players 2000 --ramp 60 --duration 300
 *
 * Options:
 *   --url        WebSocket URL of the game server (default ws://localhost:8080/ws)
 *   --players    simulated players (default 200; they play each other in pairs)
 *   --ramp       seconds over which they connect (default 30)
 *   --duration   seconds to run after the ramp (default 120)
 *   --think      milliseconds each player waits before moving (default 1500)
 *
 * What it prints every 10 s and at the end:
 *   connected / in a game / games finished / errors
 *   move round trip p50 / p95 / p99: from sending a move to the server
 *   confirming it. This is what players feel as lag; aim for p95 under 150 ms.
 *   pairing time p50 / p95: from seeking to the game starting.
 */
import { Game, PROTOCOL_VERSION, decodeServer, encode, type ClientMessage, type Color } from '@chessmate/core';
import WebSocket from 'ws';

const arg = (name: string, d: number | string) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return typeof d === 'number' ? Number(v ?? d) : (v ?? d);
};
const URL = String(arg('url', 'ws://localhost:8080/ws'));
const PLAYERS = Number(arg('players', 200));
const RAMP_S = Number(arg('ramp', 30));
const DURATION_S = Number(arg('duration', 120));
const THINK_MS = Number(arg('think', 1500));
const TC = { initialMs: 5 * 60_000, incrementMs: 0 };

const stats = { connected: 0, playing: 0, finished: 0, errors: 0, closed: 0 };
const moveRtt: number[] = [];
const pairing: number[] = [];

function pct(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!);
}

function player(n: number) {
  const ws = new WebSocket(URL);
  const send = (m: ClientMessage) => ws.readyState === WebSocket.OPEN && ws.send(encode(m));
  let game: { id: string; you: Color; chess: Game } | null = null;
  let seekAt = 0;
  const pending = new Map<number, number>();

  const seek = () => {
    seekAt = Date.now();
    send({ t: 'seek', timeControl: TC, rated: false });
  };
  const maybeMove = () => {
    if (!game || game.chess.turn !== game.you || game.chess.boardOutcome()) return;
    const g = game;
    setTimeout(
      () => {
        if (game !== g || g.chess.turn !== g.you) return;
        const legal = g.chess.legalMoves();
        const pick = legal[Math.floor(Math.random() * legal.length)];
        if (!pick) return;
        const uci = `${pick.from}${pick.to}${pick.promotion ?? ''}`;
        const ply = g.chess.ply + 1;
        pending.set(ply, Date.now());
        send({ t: 'move', gameId: g.id, uci, ply });
      },
      THINK_MS * (0.5 + Math.random()),
    );
  };

  ws.on('open', () => send({ t: 'hello', v: PROTOCOL_VERSION, token: `guest:Load${n}` }));
  ws.on('message', (raw) => {
    const m = decodeServer(String(raw));
    if (!m) return;
    switch (m.t) {
      case 'welcome':
        stats.connected++;
        seek();
        return;
      case 'gameStart':
        if (seekAt) pairing.push(Date.now() - seekAt);
        seekAt = 0;
        stats.playing++;
        game = { id: m.game.gameId, you: m.you, chess: Game.fromUciMoves(m.game.moves, m.game.initialFen) };
        maybeMove();
        return;
      case 'moved': {
        if (!game || m.gameId !== game.id) return;
        const sent = pending.get(m.ply);
        if (sent) {
          moveRtt.push(Date.now() - sent);
          pending.delete(m.ply);
        }
        if (game.chess.ply < m.ply) game.chess.move(m.uci);
        maybeMove();
        return;
      }
      case 'gameOver':
        if (!game || m.gameId !== game.id) return;
        game = null;
        stats.playing--;
        stats.finished++;
        setTimeout(seek, 1000 + Math.random() * 2000);
        return;
      case 'error':
        stats.errors++;
        return;
      default:
        return;
    }
  });
  ws.on('error', () => stats.errors++);
  ws.on('close', () => {
    stats.closed++;
    if (game) stats.playing--;
    game = null;
  });
  return ws;
}

function report(label: string) {
  console.log(
    `[${label}] connected ${stats.connected}/${PLAYERS} · in a game ${stats.playing} · finished ${stats.finished} · errors ${stats.errors} · closed ${stats.closed} | ` +
      `move round trip p50 ${pct(moveRtt, 50)} ms, p95 ${pct(moveRtt, 95)} ms, p99 ${pct(moveRtt, 99)} ms (${moveRtt.length} moves) | ` +
      `pairing p50 ${pct(pairing, 50)} ms, p95 ${pct(pairing, 95)} ms`,
  );
}

const sockets: WebSocket[] = [];
const started = Date.now();
console.log(`Load test: ${PLAYERS} players against ${URL}, ramp ${RAMP_S}s, run ${DURATION_S}s`);
for (let i = 0; i < PLAYERS; i++) setTimeout(() => sockets.push(player(i)), (i / PLAYERS) * RAMP_S * 1000);
const ticker = setInterval(() => report(`${Math.round((Date.now() - started) / 1000)}s`), 10_000);
setTimeout(
  () => {
    clearInterval(ticker);
    report('final');
    for (const s of sockets) s.close();
    setTimeout(() => process.exit(0), 500);
  },
  (RAMP_S + DURATION_S) * 1000,
);
