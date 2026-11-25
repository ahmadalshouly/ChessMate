import { Chess } from 'chess.js';

import type { BotStyle } from './styles';

/**
 * Opening repertoires, one per bot style and colour, written as lines of SAN
 * from the starting position. A bot follows a line while the game matches it
 * move for move; when its opponent leaves every line, it starts thinking for
 * itself. Lines that share their first moves make that branch more likely, so
 * the most common replies come up most often.
 *
 * Only sound, well-known openings: a bot should feel like a player with a
 * style, not one that has memorised traps. How far into a line a bot plays
 * from memory depends on its rating (`bookPlies` in bots.ts).
 */
type Book = { w: readonly string[]; b: readonly string[] };

/** Every repertoire meets 2.Qh5, which beginners love, the same calm way. */
const WAYWARD_QUEEN = 'e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6';

const REPERTOIRE: Record<BotStyle, Book> = {
  balanced: {
    w: [
      'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3',
      'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8',
      'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O',
      'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3',
      'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5',
      'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3',
      'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7',
      'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3',
      'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3',
      'e4 d6 d4 Nf6 Nc3 g6 Be3',
      'e4 Nf6 e5 Nd5 d4 d6 Nf3',
      'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3',
      'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3',
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O',
    ],
    b: [
      WAYWARD_QUEEN,
      'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O',
      'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+',
      'e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6 O-O d6',
      'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7',
      'e4 e5 Nf3 Nc6 Nc3 Nf6 d4 exd4 Nxd4 Bb4',
      'e4 e5 Nc3 Nf6 Bc4 Nc6 d3 Bc5',
      'e4 e5 Bc4 Nf6 d3 c6',
      'e4 e5 f4 exf4 Nf3 d5 exd5 Nf6',
      'e4 e5 d4 exd4 Qxd4 Nc6 Qe3 Nf6',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
      'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6',
      'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4',
      'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6',
      'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4',
      'd4 d5 Nf3 Nf6 c4 e6 Nc3 Be7',
      'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6',
      'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O',
      'd4 Nf6 Nf3 d5 c4 e6',
      'c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6',
      'c4 Nf6 Nc3 e6 d4 Bb4',
      'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7',
      'Nf3 d5 d4 Nf6 c4 e6',
      'g3 d5 Bg2 Nf6 Nf3 c6',
      'b3 e5 Bb2 Nc6 e3 d5',
      'f4 d5 Nf3 Nf6 e3 g6',
    ],
  },

  aggressive: {
    w: [
      'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Nc3',
      'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6',
      'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7',
      'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5',
      'e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3',
      'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4',
      'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 d6 Bg5 e6 Qd2',
      'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3',
      'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6',
      'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2',
      'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 Bf5',
      'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O',
      'e4 g6 d4 Bg7 Nc3 d6 f4',
      'e4 Nf6 e5 Nd5 d4 d6 Nf3',
    ],
    b: [
      WAYWARD_QUEEN,
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6',
      'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5',
      'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6',
      'e4 c5 Nf3 d6 d4 cxd4 Qxd4 Nc6 Bb5 Bd7',
      'e4 c5 Nf3 d6 Bb5+ Bd7',
      'e4 c5 Nf3 Nc6 Bb5 g6',
      'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6',
      'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4',
      'e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6',
      'e4 c5 f4 d5',
      'e4 c5 Bc4 e6',
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7',
      'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7',
      'd4 Nf6 c4 g6 Nf3 Bg7 g3 O-O Bg2 d6 O-O',
      'd4 Nf6 Nf3 g6 c4 Bg7 Nc3 O-O e4 d6',
      'd4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O',
      'd4 Nf6 Bg5 Ne4 Bf4 c5',
      'd4 Nf6 e3 g6',
      'c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6',
      'c4 Nf6 Nc3 g6 e4 d6 d4 Bg7',
      'Nf3 Nf6 c4 g6 Nc3 Bg7 e4 d6 d4 O-O',
      'Nf3 c5',
      'f4 e5 fxe5 d6 exd6 Bxd6',
      'g3 e5 Bg2 d5',
      'b3 e5 Bb2 Nc6',
    ],
  },

  solid: {
    w: [
      'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6',
      'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4',
      'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6',
      'd4 d5 Nf3 Nf6 Bf4 e6 e3 c5 c3 Nc6 Nbd2',
      'd4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3',
      'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3',
      'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O',
      'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3',
      'd4 Nf6 Nf3 e6 Bf4 c5 e3 Nc6 c3',
      'd4 f5 g3 Nf6 Bg2 e6 Nf3 Be7 O-O O-O c4',
      'd4 e6 c4 Nf6 Nc3 Bb4 Qc2',
      'd4 g6 c4 Bg7 Nc3 d6 e4',
      'd4 c5 d5 e5 e4 d6',
    ],
    b: [
      WAYWARD_QUEEN,
      'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7',
      'e4 c6 d4 d5 Nd2 dxe4 Nxe4 Bf5 Ng3 Bg6',
      'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5',
      'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6',
      'e4 c6 Nc3 d5 Nf3 Bg4',
      'e4 c6 Nf3 d5 Nc3 Bg4',
      'e4 c6 c4 d5 exd5 cxd5 cxd5 Nf6',
      'e4 c6 d3 d5 Nd2 e5 Ngf3 Bd6',
      'e4 c6 Bc4 d5 exd5 cxd5 Bb3 Nf6',
      'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6',
      'd4 d5 c4 e6 Nf3 Nf6 g3 Be7 Bg2 O-O O-O dxc4',
      'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6',
      'd4 d5 Nf3 Nf6 c4 e6 Nc3 Be7',
      'd4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6',
      'd4 d5 Nf3 Nf6 e3 e6 Bd3 c5',
      'd4 d5 e3 Nf6 Bd3 e6',
      'd4 d5 Bg5 h6 Bh4 c6',
      'c4 e6 Nc3 d5 d4 Nf6',
      'c4 e6 Nf3 d5 g3 Nf6 Bg2 Be7 O-O O-O',
      'Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4',
      'Nf3 d5 c4 e6',
      'g3 d5 Bg2 Nf6',
      'b3 e5 Bb2 Nc6',
      'f4 d5 Nf3 Nf6 e3 g6',
    ],
  },

  positional: {
    w: [
      'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7',
      'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 Nf6 O-O O-O',
      'c4 Nf6 Nc3 e6 Nf3 d5 d4 Be7',
      'c4 Nf6 Nc3 g6 g3 Bg7 Bg2 O-O e4 d6 Nge2',
      'c4 e6 Nc3 d5 d4 Nf6',
      'c4 c6 Nf3 d5 e3 Nf6 Nc3',
      'c4 g6 Nc3 Bg7 g3 d6 Bg2 e5',
      'c4 f5 Nc3 Nf6 g3 e6 Bg2 Be7',
      'Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 d3 Nbd7',
      'Nf3 Nf6 c4 e6 g3 d5 Bg2 Be7 O-O O-O d4',
      'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2',
      'd4 d5 c4 e6 g3 Nf6 Bg2 Be7 Nf3',
    ],
    b: [
      WAYWARD_QUEEN,
      'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7',
      'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6',
      'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6',
      'e4 e6 d4 d5 exd5 exd5 Nf3 Nf6 Bd3 Bd6',
      'e4 e6 Nf3 d5 Nc3 Nf6 e5 Nfd7 d4 c5',
      'e4 e6 d3 d5 Nd2 Nf6 Ngf3 c5 g3 Nc6',
      'e4 e6 Nc3 d5 d4 Bb4',
      'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O',
      'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6',
      'd4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7',
      'd4 Nf6 c4 e6 Nf3 d5 Nc3 Be7 Bf4 O-O e3',
      'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4',
      'd4 Nf6 Nf3 e6 c4 b6',
      'd4 Nf6 Nf3 e6 Bg5 h6 Bxf6 Qxf6',
      'd4 Nf6 Bf4 e6 e3 c5 c3 Nc6 Nd2 d5 Ngf3 Bd6',
      'd4 Nf6 Bg5 e6 e4 h6 Bxf6 Qxf6',
      'd4 Nf6 Nc3 d5 Bg5 e6',
      'd4 Nf6 e3 e6',
      'c4 Nf6 Nc3 e6 e4 d5 e5 d4',
      'c4 Nf6 Nf3 e6 g3 d5 Bg2 Be7 O-O O-O',
      'c4 e6 Nc3 d5 d4 Nf6',
      'Nf3 Nf6 c4 e6 Nc3 d5 d4 Be7',
      'Nf3 Nf6 g3 d5 Bg2 e6 O-O Be7',
      'g3 d5 Bg2 Nf6 Nf3 e6 O-O Be7',
      'b3 e5 Bb2 Nc6 e3 d5',
      'f4 d5 Nf3 Nf6 e3 g6',
    ],
  },

  gambit: {
    w: [
      'e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5',
      'e4 e5 f4 exf4 Nf3 d5 exd5 Nf6',
      'e4 e5 f4 d5 exd5 e4 d3 Nf6',
      'e4 e5 f4 Bc5 Nf3 d6 c3',
      'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O',
      'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6',
      'e4 e5 Nf3 Nc6 d4 exd4 Bc4 Bc5 c3 Nf6',
      'e4 e5 Nf3 Nc6 d4 exd4 c3 dxc3 Nxc3',
      'e4 e5 d4 exd4 c3 dxc3 Bc4 cxb2 Bxb2',
      'e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6 Bc4 e6 O-O Nf6 Qe2 Be7 Rd1',
      'e4 c5 d4 cxd4 c3 d3 Bxd3 Nc6',
      'e4 c5 d4 cxd4 c3 Nf6 e5 Nd5',
      'e4 c5 b4 cxb4 a3',
      'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Bd3 cxd4 cxd4 Bd7 O-O',
      'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2',
      'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 Bf5 Bc4',
      'e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 f4',
      'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 c5',
      'e4 e5 Nf3 d6 d4 exd4 Nxd4',
      'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3',
      'd4 d5 e4 dxe4 Nc3 Nf6 f3 exf3 Nxf3',
      'd4 Nf6 Nc3 d5 e4 dxe4 f3',
      'd4 d5 c4 dxc4 e4 e5 Nf3 exd4 Bxc4',
    ],
    b: [
      WAYWARD_QUEEN,
      'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 Bc5',
      'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5',
      'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+',
      'e4 e5 Nf3 Nc6 Bb5 f5 Nc3 fxe4 Nxe4 d5',
      'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5',
      'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Qh4',
      'e4 e5 Nf3 Nc6 d4 exd4 c3 d5',
      'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Nd4',
      'e4 e5 Nc3 Nf6 f4 d5',
      'e4 e5 f4 d5 exd5 e4',
      'e4 e5 Bc4 Nf6 d3 c6',
      'e4 e5 d4 exd4 Qxd4 Nc6 Qe3 Nf6',
      'd4 Nf6 c4 e5 dxe5 Ng4 Nf3 Bc5 e3 Nc6',
      'd4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6',
      'd4 d5 c4 e5 dxe5 d4 Nf3 Nc6 g3',
      'd4 Nf6 Nf3 c5 d5 b5',
      'd4 Nf6 Bf4 c5 d5 Qb6',
      'd4 Nf6 Bg5 Ne4 Bf4 c5',
      'd4 Nf6 e3 c5',
      'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5',
      'Nf3 d5 c4 d4',
      'Nf3 d5 g3 Nf6',
      'f4 e5 fxe5 d6 exd6 Bxd6 Nf3 g5',
      'g3 e5 Bg2 d5',
      'b3 e5 Bb2 Nc6 e3 d5',
    ],
  },
};

type Compiled = Record<BotStyle, { w: string[][]; b: string[][] }>;
let compiled: Compiled | null = null;

/** SAN to UCI, once. A line with an illegal move is a bug in this file (a test plays them all). */
function compileLine(line: string): string[] {
  const chess = new Chess();
  const out: string[] = [];
  for (const san of line.split(' ')) {
    const m = chess.move(san);
    out.push(m.from + m.to + (m.promotion ?? ''));
  }
  return out;
}

function book(): Compiled {
  if (compiled) return compiled;
  const out = {} as Compiled;
  for (const style of Object.keys(REPERTOIRE) as BotStyle[]) {
    out[style] = { w: REPERTOIRE[style].w.map(compileLine), b: REPERTOIRE[style].b.map(compileLine) };
  }
  compiled = out;
  return out;
}

/** Every line of a style for one colour, in UCI (for tests and tooling). */
export function repertoireLines(style: BotStyle, color: 'w' | 'b'): string[][] {
  return book()[style][color];
}

/**
 * The next move from the style's repertoire for the side to move after
 * `moves` (UCI, from the starting position), or null when the game has left
 * every line.
 */
export function repertoireMove(style: BotStyle, moves: readonly string[], random: () => number = Math.random): string | null {
  const side = moves.length % 2 === 0 ? 'w' : 'b';
  const lines = book()[style][side].filter((l) => l.length > moves.length && moves.every((m, i) => l[i] === m));
  if (!lines.length) return null;
  return lines[Math.min(lines.length - 1, Math.floor(random() * lines.length))]![moves.length]!;
}
