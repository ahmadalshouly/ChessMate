import { describe, expect, it } from 'vitest';

import {
  cleanChannel,
  cleanEventInput,
  cleanGoLive,
  cleanPlayerInput,
  cleanRoundInput,
  cleanStreamerApplication,
  computeStandings,
  eventStatusOf,
  federationIso,
  gameEndingOf,
  lichessRoundIdOf,
  lichessTourToEvent,
  parseBroadcastPgn,
  roundStatusOf,
} from '../src/broadcasts';
import { lichessRound } from './fixtures/lichessRound';

const PGN = `[Event "Test Open"]
[Round "3.1"]
[White "Carlsen, Magnus"]
[Black "Nakamura, Hikaru"]
[WhiteTitle "GM"]
[BlackTitle "GM"]
[WhiteElo "2830"]
[BlackElo "2790"]
[WhiteFideId "1503014"]
[Result "*"]

1. e4 { [%clk 1:59:58] } 1... e5 { [%clk 1:59:50] } 2. Nf3 { [%clk 1:59:10] } *

[Event "Test Open"]
[Round "3.2"]
[White "Ding, Liren"]
[Black "Gukesh D"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 1/2-1/2

[Event "Broken"]
[White "X"]
[Black "Y"]
[Result "*"]

1. e4 e4 *
`;

describe('broadcast PGN', () => {
  it('reads players, ratings, titles, board, moves and clocks', () => {
    const games = parseBroadcastPgn(PGN);
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ white: 'Carlsen, Magnus', whiteTitle: 'GM', whiteElo: 2830, blackElo: 2790, whiteFideId: '1503014', result: '*', board: 1, moves: ['e2e4', 'e7e5', 'g1f3'] });
    expect(games[0]!.clocks).toEqual([7_198_000, 7_190_000, 7_150_000]);
    expect(games[1]).toMatchObject({ result: '1/2-1/2', board: 2, clocks: [null, null, null] });
  });
});

describe('statuses', () => {
  it('rounds and events', () => {
    expect(roundStatusOf([{ result: '1-0', ply: 40 }, { result: '1/2-1/2', ply: 30 }], null, 0)).toBe('finished');
    expect(roundStatusOf([{ result: '*', ply: 4 }], null, 0)).toBe('live');
    expect(roundStatusOf([{ result: '*', ply: 0 }], 1000, 500)).toBe('upcoming');
    expect(eventStatusOf({ startsAt: 1000, endsAt: 2000 }, [], 500)).toBe('upcoming');
    expect(eventStatusOf({ startsAt: 1000, endsAt: 2000 }, [{ status: 'live' }], 1500)).toBe('live');
    expect(eventStatusOf({ startsAt: 1000, endsAt: 2000 }, [{ status: 'finished' }], 1500)).toBe('finished');
  });
});

describe('standings', () => {
  it('scores points, Buchholz and performance, matching players by name', () => {
    const rows = computeStandings(
      [
        { id: 'a', name: 'Alice', title: 'GM', rating: 2600, federation: 'NL' },
        { id: 'b', name: 'Bob', title: null, rating: 2400, federation: null },
      ],
      [
        { white: { name: 'alice', playerId: null, rating: 2600 }, black: { name: 'Bob', playerId: null, rating: 2400 }, result: '1-0' },
        { white: { name: 'Carol', playerId: null, rating: 2500 }, black: { name: 'Alice', playerId: 'a', rating: 2600 }, result: '1/2-1/2' },
        { white: { name: 'Bob', playerId: 'b', rating: 2400 }, black: { name: 'Carol', playerId: null, rating: 2500 }, result: '*' },
      ],
    );
    expect(rows.map((r) => [r.name, r.points])).toEqual([
      ['Alice', 1.5],
      ['Carol', 0.5],
      ['Bob', 0],
    ]);
    expect(rows[0]).toMatchObject({ games: 2, wins: 1, draws: 1, buchholz: 0.5, performance: 2650 });
  });
});

describe('validation', () => {
  it('channels must be on their platform and https', () => {
    expect(cleanChannel({ platform: 'twitch', url: 'twitch.tv/somechess' })).toEqual({ value: { platform: 'twitch', url: 'https://twitch.tv/somechess' } });
    expect(cleanChannel({ platform: 'twitch', url: 'https://youtube.com/@x' })).toHaveProperty('error');
    expect(cleanChannel({ url: 'https://www.youtube.com/@chess' })).toEqual({ value: { platform: 'youtube', url: 'https://www.youtube.com/@chess' } });
    expect(cleanChannel({ platform: 'other', url: 'javascript:alert(1)' })).toHaveProperty('error');
    expect(cleanStreamerApplication({ channels: [], about: 'x'.repeat(30) })).toHaveProperty('error');
  });
  it('going live uses a channel or a known platform', () => {
    const chans = [{ platform: 'other' as const, url: 'https://mysite.example/live' }];
    expect(cleanGoLive({ title: 'Blitz' }, chans)).toEqual({ value: { title: 'Blitz', url: 'https://mysite.example/live' } });
    expect(cleanGoLive({ title: 'Blitz', url: 'https://evil.example/x' }, chans)).toHaveProperty('error');
    expect(cleanGoLive({ title: 'Blitz', url: 'https://kick.com/me' }, chans)).toMatchObject({ value: { url: 'https://kick.com/me' } });
  });
  it('events, players and rounds', () => {
    expect(cleanEventInput({ name: 'Open', startsAt: 2000, endsAt: 1000 })).toMatchObject({ field: 'endsAt' });
    expect(cleanEventInput({ name: 'Open', startsAt: 1000, endsAt: 2000, format: 'swiss', website: 'example.org' })).toMatchObject({ value: { format: 'swiss', website: 'https://example.org/' } });
    expect(cleanPlayerInput({ name: 'Ann', title: 'gm', rating: '2500', federation: 'nl' })).toEqual({ value: { name: 'Ann', title: 'GM', rating: 2500, federation: 'NL', fideId: null, username: null } });
    expect(cleanPlayerInput({ name: 'Ann', title: 'XX' })).toHaveProperty('error');
    expect(cleanRoundInput({ number: 2, source: { kind: 'lichess', url: 'https://lichess.org/broadcast/tata-steel/round-2/AbCd1234' } })).toMatchObject({ value: { name: 'Round 2', source: { kind: 'lichess', lichessRoundId: 'AbCd1234' } } });
    expect(cleanRoundInput({ number: 1, source: { kind: 'pgnUrl', url: 'ftp://x' } })).toHaveProperty('error');
    expect(lichessRoundIdOf('https://example.com/broadcast/a/b/AbCd1234')).toBeNull();
    // A link copied while a game was open ends with the game id, not the round id.
    expect(lichessRoundIdOf('https://lichess.org/broadcast/tata-steel/round-2/AbCd1234/Gm5x9qRt')).toBe('AbCd1234');
    expect(lichessRoundIdOf('https://lichess.org/broadcast/tata-steel/round-2/AbCd1234/Gm5x9qRt#12')).toBe('AbCd1234');
    expect(lichessRoundIdOf('https://lichess.org/broadcast/tata-steel/TourId12')).toBeNull();
  });
  it('maps a Lichess tournament to an event', () => {
    const e = lichessTourToEvent({ id: 't1', name: 'Candidates 2026', dates: [1000, 9000], info: { format: '8-player double round robin', tc: '120+30', location: 'Toronto' } }, []);
    expect(e).toMatchObject({ name: 'Candidates 2026', startsAt: 1000, endsAt: 9000, format: 'roundRobin', timeControl: '120+30', location: 'Toronto' });
  });
});

describe('Lichess broadcast files', () => {
  it('reads a real round download: several comments on one move, clocks and evals kept', () => {
    const games = parseBroadcastPgn(lichessRound(29));
    expect(games).toHaveLength(29);
    const g = games[0]!;
    expect(g).toMatchObject({ white: 'Player W1', board: 1, whiteTitle: 'FM', blackTitle: 'IM', whiteElo: 2347, whiteFideId: '1001' });
    expect(g.moves).toHaveLength(48);
    // Clocks survive, also on moves that carry an engine note ("Kh8?!" is ply 38).
    expect(g.clocks[0]).toBe((1 * 3600 + 30 * 60 + 57) * 1000);
    expect(g.clocks[37]).toBe((41 * 60 + 55) * 1000);
    expect(games.map((x) => x.board)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
  });

  it('maps FIDE federation codes to flags', () => {
    expect(federationIso('BEL')).toBe('BE');
    expect(federationIso('GER')).toBe('DE');
    expect(federationIso('ENG')).toBe('GB');
    expect(federationIso('se')).toBe('SE');
    expect(federationIso('FID')).toBeNull();
    expect(federationIso('')).toBeNull();
  });
});

describe('how broadcast games ended', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  it('tells checkmate, resignation, time, draws and forfeits apart', () => {
    expect(gameEndingOf({ result: '0-1', fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', ply: 4 })).toBe('checkmate');
    const midgame = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    expect(gameEndingOf({ result: '1-0', fen: midgame, ply: 4 })).toBe('resign');
    expect(gameEndingOf({ result: '1-0', fen: midgame, ply: 4, blackClockMs: 0, whiteClockMs: 5000 })).toBe('timeout');
    expect(gameEndingOf({ result: '0-1', fen: midgame, ply: 4, termination: 'Time forfeit' })).toBe('timeout');
    expect(gameEndingOf({ result: '1-0', fen: midgame, ply: 4, termination: 'Abandoned' })).toBe('forfeit');
    expect(gameEndingOf({ result: '1/2-1/2', fen: midgame, ply: 4 })).toBe('agreement');
    expect(gameEndingOf({ result: '1/2-1/2', fen: '8/8/8/4k3/8/8/4K3/8 w - - 0 60', ply: 118 })).toBe('insufficient');
    expect(gameEndingOf({ result: '1/2-1/2', fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 70', ply: 138 })).toBe('stalemate');
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
    expect(gameEndingOf({ result: '1/2-1/2', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 8 5', moves: shuffle, initialFen: START })).toBe('repetition');
    expect(gameEndingOf({ result: '1/2-1/2', fen: '4k3/8/8/8/8/8/3R4/4K3 w - - 100 120', ply: 238 })).toBe('fiftyMove');
  });

  it('says nothing for games in play or results without moves', () => {
    expect(gameEndingOf({ result: '*', fen: START, ply: 10 })).toBeNull();
    expect(gameEndingOf({ result: '1-0', fen: START, ply: 0 })).toBeNull();
    expect(gameEndingOf({ result: '1-0', fen: START, moves: [] })).toBeNull();
  });
});
