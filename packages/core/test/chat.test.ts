import { describe, expect, it } from 'vitest';
import { CHAT_MAX_LENGTH, QUICK_MESSAGES, filterProfanity, isReportReason, prepareChat, quickMessageText, sanitizeChat } from '../src/chat';

describe('profanity filter', () => {
  it('masks blocked words and keeps the first letter', () => {
    expect(filterProfanity('what the fuck')).toEqual({ text: 'what the f***', filtered: true });
    expect(filterProfanity('you are a bitch!').text).toBe('you are a b****!');
  });

  it('catches leetspeak, separators and stretched letters', () => {
    for (const w of ['sh1t', 'f.u.c.k', 'fuuuuck', '$hit', 'f*ck', 'FUCKING', 'B1tch']) {
      expect(filterProfanity(w).filtered, w).toBe(true);
    }
  });

  it('leaves innocent words alone', () => {
    for (const w of ['class', 'Scunthorpe', 'assassin', 'cocktail', 'Dickens', 'title', 'passed pawn', 'bitcoin', 'hello', 'cumulative']) {
      expect(filterProfanity(w), w).toEqual({ text: w, filtered: false });
    }
  });

  it('matches short words only as whole words', () => {
    expect(filterProfanity('ass').filtered).toBe(true);
    expect(filterProfanity('kys').filtered).toBe(true);
    expect(filterProfanity('assess').filtered).toBe(false);
  });
});

describe('chat helpers', () => {
  it('sanitizes control characters, whitespace and length', () => {
    expect(sanitizeChat('  hi\n\n there\u0007 ')).toBe('hi there');
    expect(sanitizeChat('x'.repeat(500))).toHaveLength(CHAT_MAX_LENGTH);
    expect(prepareChat('   ')).toBeNull();
    expect(prepareChat(42)).toBeNull();
  });

  it('resolves quick messages and report reasons', () => {
    expect(quickMessageText('good_game')).toBe('Good game!');
    expect(quickMessageText('nope')).toBeNull();
    expect(new Set(QUICK_MESSAGES.map((q) => q.id)).size).toBe(QUICK_MESSAGES.length);
    expect(isReportReason('cheating')).toBe(true);
    expect(isReportReason('bad')).toBe(false);
  });
});
