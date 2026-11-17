import { describe, expect, it } from 'vitest';
import { challengePath, describeChallengeColor, inviteUrl, isChallengeId, parseInvite, resolveChallengeColor } from '../src/challenge';

describe('challenge links', () => {
  const id = 'Ab3_x-9QzK1m';

  it('builds web and deep links', () => {
    expect(challengePath(id)).toBe(`/challenge/${id}`);
    expect(inviteUrl('https://chessmate.example/', id)).toBe(`https://chessmate.example/challenge/${id}`);
    expect(inviteUrl('chessmate://', id)).toBe(`chessmate://challenge/${id}`);
  });

  it('parses every link shape a user might paste', () => {
    expect(parseInvite(id)).toBe(id);
    expect(parseInvite(`  https://chessmate.example/challenge/${id}?ref=x `)).toBe(id);
    expect(parseInvite(`chessmate://challenge/${id}`)).toBe(id);
    expect(parseInvite(`exp://192.168.1.20:8081/--/challenge/${id}`)).toBe(id);
    expect(parseInvite('https://chessmate.example/challenge/short')).toBeNull();
    expect(parseInvite('hello world')).toBeNull();
    expect(isChallengeId('../../etc')).toBe(false);
  });

  it('resolves colours', () => {
    expect(resolveChallengeColor('w')).toBe('w');
    expect(resolveChallengeColor('random', () => 0.1)).toBe('w');
    expect(resolveChallengeColor('random', () => 0.9)).toBe('b');
    expect(describeChallengeColor('random')).toBe('Random colour');
  });
});
