import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import {
  IMMORTAL_GAMES,
  IMMORTAL_PLAYERS,
  IMMORTAL_THEMES,
  immortalGame,
  immortalGamePath,
  immortalGamePgn,
  immortalGamesOf,
  immortalKeyPly,
  immortalLine,
  immortalMoments,
  immortalOfTheDay,
  immortalOrientation,
  immortalOutcome,
  immortalSide,
  parseMomentMove,
  parsePgn,
  pathWithQuery,
} from '../src';

/** The position a game ends in, as chess.js sees it. */
function finalPosition(id: string) {
  const g = immortalGame(id)!;
  const line = immortalLine(g);
  return new Chess(line.fens[line.fens.length - 1]);
}

describe('immortals content', () => {
  it('has unique ids and every game links to legends who played it', () => {
    const playerIds = IMMORTAL_PLAYERS.map((p) => p.id);
    const gameIds = IMMORTAL_GAMES.map((g) => g.id);
    expect(new Set(playerIds).size).toBe(playerIds.length);
    expect(new Set(gameIds).size).toBe(gameIds.length);
    for (const g of IMMORTAL_GAMES) {
      expect(g.legends.length, g.id).toBeGreaterThan(0);
      for (const id of g.legends) expect(immortalSide(g, id), `${g.id}: ${id} must be White or Black`).not.toBeNull();
      expect(g.themes.every((t) => IMMORTAL_THEMES.includes(t)), g.id).toBe(true);
      expect(g.date, g.id).toMatch(/^\d{4}\.(\d{2}|\?\?)\.(\d{2}|\?\?)$/);
      expect(g.story.length, g.id).toBeGreaterThan(0);
    }
  });

  it('gives every legend a profile and at least one game told from their side', () => {
    for (const p of IMMORTAL_PLAYERS) {
      expect(p.bio.length, p.id).toBeGreaterThan(0);
      expect(p.died === null || p.died > p.born, p.id).toBe(true);
      expect(IMMORTAL_GAMES.some((g) => g.legends[0] === p.id), `${p.id} leads no game`).toBe(true);
    }
  });

  it('lists games oldest first', () => {
    const dates = IMMORTAL_GAMES.map((g) => g.date.replace(/\?/g, '0'));
    expect(dates).toEqual([...dates].sort());
  });

  it('replays every score legally from the start', () => {
    for (const g of IMMORTAL_GAMES) {
      const line = immortalLine(g);
      expect(line.san.length, g.id).toBeGreaterThan(10);
      expect(line.uci.length).toBe(line.san.length);
      expect(line.fens.length).toBe(line.san.length + 1);
      // The movetext carries no result of its own except a trailing one matching the game's.
      const trailing = /(1-0|0-1|1\/2-1\/2)\s*$/.exec(g.moves)?.[1];
      if (trailing) expect(trailing, g.id).toBe(g.result);
    }
  });

  it('ends mates with the right result and never in a position the score contradicts', () => {
    for (const g of IMMORTAL_GAMES) {
      const end = finalPosition(g.id);
      if (end.isCheckmate()) expect(g.result, g.id).toBe(end.turn() === 'w' ? '0-1' : '1-0');
      // A decisive result never stands on a stalemate or a dead draw.
      expect(end.isStalemate() || end.isInsufficientMaterial(), g.id).toBe(false);
    }
    // The famous finishes really are mate on the board.
    for (const id of ['immortal-game', 'evergreen-game', 'opera-game', 'game-of-the-century', 'carlsen-ernst-2004']) {
      expect(finalPosition(id).isCheckmate(), id).toBe(true);
    }
  });

  it('matches the historic scores at their famous moves', () => {
    const at = (id: string, move: string) => {
      const m = parseMomentMove(move)!;
      return immortalLine(immortalGame(id)!).san[m.ply - 1];
    };
    expect(at('immortal-game', '18. Bd6')).toBe('Bd6');
    expect(at('paulsen-morphy-1857', '17...Qxf3')).toBe('Qxf3');
    expect(at('levitsky-marshall-1912', '23...Qg3')).toBe('Qg3');
    expect(at('bernstein-capablanca-1914', '29...Qb2')).toBe('Qb2');
    expect(at('botvinnik-capablanca-1938', '30. Ba3')).toBe('Ba3');
    expect(at('game-of-the-century', '17...Be6')).toBe('Be6');
    expect(at('botvinnik-tal-1960', '21...Nf4')).toBe('Nf4');
    expect(at('tal-larsen-1965', '16. Nd5')).toBe('Nd5');
    expect(at('kasparov-topalov-1999', '24. Rxd4')).toBe('Rxd4');
    // Game lengths as published.
    const plies = Object.fromEntries(IMMORTAL_GAMES.map((g) => [g.id, immortalLine(g).san.length]));
    expect(plies['lasker-bauer-1889']).toBe(75);
    expect(plies['bogoljubov-alekhine-1922']).toBe(106);
    expect(plies['karpov-kasparov-1985-16']).toBe(80);
    expect(plies['polgar-kasparov-2002']).toBe(84);
  });

  it('resolves every moment to the move it names', () => {
    for (const g of IMMORTAL_GAMES) {
      expect(g.moments.length, g.id).toBeGreaterThan(0);
      const resolved = immortalMoments(g);
      // A moment whose move is not in the score is dropped, so a typo shows up as a missing one.
      expect(resolved.map((m) => m.at), g.id).toEqual(g.moments.map((m) => m.at));
      expect(immortalKeyPly(g)).toBe(resolved[0]!.ply);
    }
  });

  it('backs up the stories told about the games', () => {
    // Karpov's bishop goes to a7 on move 24 and never moves again.
    const karpov = immortalLine(immortalGame('karpov-unzicker-1974')!);
    const ba7 = karpov.san.indexOf('Ba7');
    expect((ba7 + 2) / 2).toBe(24);
    expect(karpov.uci.slice(ba7 + 1).some((m) => m.startsWith('a7'))).toBe(false);
    // Kasparov's knight sits on d3 from move 16 until it is taken on move 34.
    const k16 = immortalLine(immortalGame('karpov-kasparov-1985-16')!);
    const nd3 = k16.san.indexOf('Nd3');
    const taken = k16.san.indexOf('Qxd3');
    expect((taken - nd3 + 1) / 2).toBe(18);
    expect(k16.uci.slice(nd3 + 1, taken).some((m) => m.startsWith('d3'))).toBe(false);
    // Levitsky–Marshall: every capture of the queen on g3 loses at once or is mated.
    const marshall = finalPosition('levitsky-marshall-1912');
    const captures = marshall.moves({ verbose: true }).filter((m) => m.to === 'g3');
    expect(captures.map((m) => m.san).sort()).toEqual(['Qxg3', 'fxg3', 'hxg3']);
    const afterHxg3 = new Chess(marshall.fen());
    afterHxg3.move('hxg3');
    afterHxg3.move('Ne2');
    expect(afterHxg3.isCheckmate()).toBe(true);
    const afterFxg3 = new Chess(marshall.fen());
    for (const m of ['fxg3', 'Ne2+', 'Kh1', 'Rxf1#']) afterFxg3.move(m);
    expect(afterFxg3.isCheckmate()).toBe(true);
    // Polugaevsky resigned facing mate next move: every reply allows mate in one.
    const nezh = finalPosition('polugaevsky-nezhmetdinov-1958');
    for (const reply of nezh.moves()) {
      const c = new Chess(nezh.fen());
      c.move(reply);
      const mates = c.moves().some((m) => {
        const d = new Chess(c.fen());
        d.move(m);
        return d.isCheckmate();
      });
      expect(mates, reply).toBe(true);
    }
    // The Immortal: whatever Black does against Qf6+, mate follows. The Opera: the reply is forced.
    const immortal = immortalLine(immortalGame('immortal-game')!);
    const qf6 = immortal.fens[immortal.san.indexOf('Qf6+') + 1]!;
    for (const reply of new Chess(qf6).moves()) {
      const c = new Chess(qf6);
      c.move(reply);
      expect(c.moves().some((m) => new Chess(c.fen()).move(m).san.endsWith('#')), reply).toBe(true);
    }
    const opera = immortalLine(immortalGame('opera-game')!);
    expect(new Chess(opera.fens[opera.san.indexOf('Qb8+') + 1]).moves()).toEqual(['Nxb8']);
  });
});

describe('immortals helpers', () => {
  it('parses moment moves to plies', () => {
    expect(parseMomentMove('1. e4')).toEqual({ ply: 1, san: 'e4' });
    expect(parseMomentMove('1...e5')).toEqual({ ply: 2, san: 'e5' });
    expect(parseMomentMove('17...Qxf3')).toEqual({ ply: 34, san: 'Qxf3' });
    expect(parseMomentMove('18. Bd6')).toEqual({ ply: 35, san: 'Bd6' });
    expect(parseMomentMove('Bd6')).toBeNull();
  });

  it('knows who played what and how it went', () => {
    const g = immortalGame('fischer-spassky-1972-6')!;
    expect(immortalSide(g, 'fischer')).toBe('w');
    expect(immortalSide(g, 'spassky')).toBe('b');
    expect(immortalSide(g, 'tal')).toBeNull();
    expect(immortalOutcome(g, 'fischer')).toBe('win');
    expect(immortalOutcome(g, 'spassky')).toBe('loss');
    expect(immortalOrientation(immortalGame('game-of-the-century')!)).toBe('b');
    expect(immortalOrientation(immortalGame('immortal-game')!)).toBe('w');
  });

  it('lists a legend\'s own games before the ones they lost', () => {
    const spassky = immortalGamesOf('spassky').map((g) => g.id);
    expect(spassky).toEqual(['spassky-bronstein-1960', 'fischer-spassky-1972-6']);
    expect(immortalGamesOf('nobody')).toEqual([]);
  });

  it('writes PGN that other software reads back to the same moves', () => {
    for (const g of IMMORTAL_GAMES) {
      const pgn = immortalGamePgn(g);
      expect(pgn).toContain(`[White "${g.white}"]`);
      expect(pgn).toContain(`[Result "${g.result}"]`);
      const back = parsePgn(pgn);
      expect(back.errors, g.id).toEqual([]);
      expect(back.games[0]!.moves, g.id).toEqual(immortalLine(g).uci);
      expect(back.games[0]!.result).toBe(g.result);
    }
  });

  it('links to games and picks one game a day', () => {
    expect(pathWithQuery(immortalGamePath('opera-game'))).toBe('/immortals/game/opera-game');
    expect(pathWithQuery(immortalGamePath('opera-game', 31))).toBe('/immortals/game/opera-game?ply=31');
    const day = Date.UTC(2026, 10, 25);
    expect(immortalOfTheDay(day).id).toBe(immortalOfTheDay(day + 3_600_000).id);
    expect(immortalOfTheDay(day).id).not.toBe(immortalOfTheDay(day + 86_400_000).id);
  });
});
