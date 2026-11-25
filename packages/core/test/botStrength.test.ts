import { describe, expect, it } from 'vitest';
import {
  BOT_STYLES,
  BOTS,
  Game,
  START_FEN,
  STOCKFISH_ELO_MAX,
  STOCKFISH_ELO_MIN,
  bookMove,
  bookPlies,
  botEngine,
  coreBotSettings,
  isBookPosition,
  repertoireLines,
  repertoireMove,
  stockfishSkillLevel,
  validateOnlineBot,
} from '../src';

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe('bot strength', () => {
  it('uses the small search below Stockfish’s range and Stockfish from 1320 up', () => {
    expect(botEngine(250).kind).toBe('core');
    expect(botEngine(STOCKFISH_ELO_MIN - 1).kind).toBe('core');
    expect(botEngine(STOCKFISH_ELO_MIN)).toMatchObject({ kind: 'stockfish', elo: STOCKFISH_ELO_MIN });
    expect(botEngine(2650)).toMatchObject({ kind: 'stockfish', elo: 2650 });
    expect(botEngine(STOCKFISH_ELO_MAX)).toMatchObject({ kind: 'stockfish', elo: STOCKFISH_ELO_MAX });
    // Above Stockfish's own limit: full strength, longer thinking the higher it goes.
    const a = botEngine(3250);
    const b = botEngine(3500);
    expect(a).toMatchObject({ kind: 'stockfish', elo: null });
    expect(b).toMatchObject({ kind: 'stockfish', elo: null });
    expect(b.kind === 'stockfish' && a.kind === 'stockfish' && b.movetimeMs > a.movetimeMs).toBe(true);
    // Out-of-range ratings are clamped, never an error.
    expect(botEngine(99999)).toEqual(botEngine(3500));
    expect(botEngine(-10)).toEqual(botEngine(250));
  });

  it('gets stronger with rating everywhere on the scale', () => {
    // With the strength limit, a higher UCI_Elo and a deeper search; beyond it, more time.
    let lastDepth = 0;
    const lastTime = { limited: 0, full: 0 };
    for (let r = STOCKFISH_ELO_MIN; r <= 3500; r += 50) {
      const e = botEngine(r);
      if (e.kind !== 'stockfish') throw new Error('expected stockfish');
      const regime = e.elo === null ? 'full' : 'limited';
      expect(e.movetimeMs).toBeGreaterThanOrEqual(lastTime[regime]);
      lastTime[regime] = e.movetimeMs;
      if (e.elo !== null) {
        expect(e.elo).toBe(r);
        expect(e.depth).toBeGreaterThanOrEqual(lastDepth);
        lastDepth = e.depth;
      }
    }
    let lastNoise = Infinity;
    let lastBlunder = Infinity;
    for (let r = 250; r < STOCKFISH_ELO_MIN; r += 25) {
      const s = coreBotSettings(r);
      expect(s.noise).toBeLessThanOrEqual(lastNoise);
      expect(s.blunderChance).toBeLessThanOrEqual(lastBlunder);
      lastNoise = s.noise;
      lastBlunder = s.blunderChance;
    }
  });

  it('keeps the original eight opponents’ search settings', () => {
    expect(coreBotSettings(400)).toMatchObject({ depth: 1, noise: 260, blunderChance: 0.3 });
    expect(coreBotSettings(700)).toMatchObject({ depth: 1, noise: 140, blunderChance: 0.15 });
    expect(coreBotSettings(1000)).toMatchObject({ depth: 2, noise: 80, blunderChance: 0.08 });
    expect(coreBotSettings(1250)).toMatchObject({ depth: 2, noise: 45, blunderChance: 0.04 });
    expect(coreBotSettings(2200)).toMatchObject({ depth: 64, noise: 0, blunderChance: 0, timeMs: 2200 });
    // The small search tops out there; stronger bots fall back to it on devices without Stockfish.
    expect(coreBotSettings(3500)).toEqual(coreBotSettings(2200));
  });

  it('matches Stockfish’s own skill curve', () => {
    expect(stockfishSkillLevel(STOCKFISH_ELO_MIN)).toBe(0);
    expect(stockfishSkillLevel(STOCKFISH_ELO_MAX)).toBeGreaterThan(18);
    expect(stockfishSkillLevel(STOCKFISH_ELO_MAX)).toBeLessThanOrEqual(19);
    for (let r = STOCKFISH_ELO_MIN; r < STOCKFISH_ELO_MAX; r += 10) expect(stockfishSkillLevel(r + 10)).toBeGreaterThanOrEqual(stockfishSkillLevel(r));
  });
});

describe('opening repertoires', () => {
  it('every line is legal and stays on known opening theory for its first moves', () => {
    for (const style of BOT_STYLES) {
      for (const color of ['w', 'b'] as const) {
        const lines = repertoireLines(style, color);
        expect(lines.length, `${style} ${color}`).toBeGreaterThan(8);
        for (const line of lines) {
          const g = Game.fromUciMoves(line);
          expect(g.ply).toBe(line.length);
          // The first few moves of each line are named theory.
          const opening = new Game(START_FEN);
          for (const m of line.slice(0, 2)) opening.move(m);
          expect(isBookPosition(opening.fen), `${style} ${color} ${line.join(' ')}`).toBe(true);
        }
      }
    }
  });

  it('answers the first move in each style’s own way', () => {
    // As white: aggressive and gambit players open 1.e4, solid ones 1.d4, positional ones mostly 1.c4/1.Nf3.
    const firsts = (style: (typeof BOT_STYLES)[number]) => new Set(Array.from({ length: 40 }, (_, i) => repertoireMove(style, [], seeded(i + 1))));
    expect([...firsts('aggressive')].every((m) => m === 'e2e4')).toBe(true);
    expect([...firsts('solid')].every((m) => m === 'd2d4')).toBe(true);
    expect([...firsts('positional')].some((m) => m === 'c2c4' || m === 'g1f3')).toBe(true);
    // As black against 1.e4: the Sicilian for attackers, the Caro-Kann for solid players, the French for positional ones.
    expect(repertoireMove('aggressive', ['e2e4'], seeded(3))).toBe('c7c5');
    expect(repertoireMove('solid', ['e2e4'], seeded(3))).toBe('c7c6');
  });

  it('leaves the book when the opponent does', () => {
    expect(repertoireMove('solid', ['a2a3'])).toBeNull();
    expect(repertoireMove('balanced', ['e2e4', 'e7e5', 'a2a3'])).toBeNull();
  });

  it('plays deeper from memory the stronger the bot', () => {
    expect(bookPlies(250)).toBe(0);
    expect(bookPlies(400)).toBe(1);
    expect(bookPlies(3500)).toBe(24);
    const weak = BOTS.find((b) => b.rating === 250)!;
    expect(bookMove(weak, { moves: [] })).toBeNull();
    const strong = BOTS.find((b) => b.rating === 3500)!;
    expect(bookMove(strong, { moves: [] })).not.toBeNull();
    // Never from a custom start position.
    expect(bookMove(strong, { moves: [], startFen: 'k7/8/8/8/8/8/8/K7 w - - 0 1' })).toBeNull();
  });
});

describe('online bot validation', () => {
  const ok = { name: '  Captain   Rook ', rating: 2400, style: 'aggressive', tag: 'streamer', url: 'twitch.tv/captainrook', imageUrl: '', featured: true };

  it('accepts a complete bot and tidies it', () => {
    const v = validateOnlineBot(ok);
    expect('value' in v && v.value).toEqual({
      name: 'Captain Rook',
      tagline: null,
      rating: 2400,
      style: 'aggressive',
      tag: 'streamer',
      url: 'https://twitch.tv/captainrook',
      imageUrl: null,
      featured: true,
      enabled: true,
    });
  });

  it('refuses what the app could not show or play', () => {
    expect(validateOnlineBot({ ...ok, name: 'x' })).toMatchObject({ field: 'name' });
    expect(validateOnlineBot({ ...ok, rating: 4000 })).toMatchObject({ field: 'rating' });
    expect(validateOnlineBot({ ...ok, rating: 'strong' })).toMatchObject({ field: 'rating' });
    expect(validateOnlineBot({ ...ok, style: 'chaotic' })).toMatchObject({ field: 'style' });
    expect(validateOnlineBot({ ...ok, tag: 'staff' })).toMatchObject({ field: 'tag' });
    expect(validateOnlineBot({ ...ok, url: 'not a link' })).toMatchObject({ field: 'url' });
    expect(validateOnlineBot({ ...ok, image: 'data:text/html;base64,AAAA' })).toMatchObject({ field: 'image' });
  });

  it('keeps the stored picture unless the form sends a new one or clears it', () => {
    const keep = validateOnlineBot(ok);
    expect('value' in keep && 'image' in keep.value).toBe(false);
    const clear = validateOnlineBot({ ...ok, image: null });
    expect('value' in clear && clear.value.image).toBeNull();
  });
});
