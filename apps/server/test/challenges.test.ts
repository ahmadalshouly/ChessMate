import { parseTimeControl } from '@chessmate/core';
import { describe, expect, it } from 'vitest';
import { ChallengeBook } from '../src/challenges';

const A = { id: 'a', name: 'Alice', rating: 1500, provisional: true };
const B = { id: 'b', name: 'Bob', rating: 1500, provisional: true };
const C = { id: 'c', name: 'Cara', rating: 1500, provisional: true };
const tc = parseTimeControl('5+3');

function book(limits = { directTtlMs: 1000, openTtlMs: 5000, maxOutgoing: 2 }) {
  let n = 0;
  return new ChallengeBook(limits, () => `challenge${++n}`);
}

describe('ChallengeBook', () => {
  it('creates direct and open challenges with their own lifetimes', () => {
    const b = book();
    const direct = b.create({ from: A, to: B, timeControl: tc, rated: true, color: 'w' }, 0);
    const open = b.create({ from: A, to: null, timeControl: tc, rated: false, color: 'random' }, 0);
    expect(direct).toMatchObject({ status: 'pending', expiresAt: 1000, to: B });
    expect(open).toMatchObject({ status: 'pending', expiresAt: 5000, to: null });
    expect(b.incoming('b')).toHaveLength(1);
    expect(b.outgoing('a')).toHaveLength(2);
  });

  it('rejects self-challenges and caps outgoing challenges', () => {
    const b = book();
    expect(b.create({ from: A, to: A, timeControl: tc, rated: false, color: 'w' }, 0)).toBe('self');
    b.create({ from: A, to: null, timeControl: tc, rated: false, color: 'w' }, 0);
    b.create({ from: A, to: null, timeControl: tc, rated: false, color: 'w' }, 0);
    expect(b.create({ from: A, to: null, timeControl: tc, rated: false, color: 'w' }, 0)).toBe('too_many');
  });

  it('replaces an earlier direct challenge to the same player', () => {
    const b = book();
    b.create({ from: A, to: B, timeControl: tc, rated: false, color: 'w' }, 0);
    b.create({ from: A, to: B, timeControl: parseTimeControl('10+0'), rated: false, color: 'b' }, 1);
    expect(b.incoming('b')).toHaveLength(1);
    expect(b.incoming('b')[0]!.color).toBe('b');
  });

  it('only lets the named player accept or decline a direct challenge', () => {
    const b = book();
    const c = b.create({ from: A, to: B, timeControl: tc, rated: false, color: 'w' }, 0);
    if (typeof c === 'string') throw new Error(c);
    expect(b.canAccept(c.id, 'c', 1)).toBe('not_allowed');
    expect(b.canAccept(c.id, 'a', 1)).toBe('self');
    expect(b.decline(c.id, 'c', 1)).toBe('not_allowed');
    expect(b.canAccept(c.id, 'b', 1)).toMatchObject({ id: c.id });
    expect(b.decline(c.id, 'b', 1)).toMatchObject({ status: 'declined' });
    expect(b.get(c.id, 2)).toBeUndefined();
  });

  it('lets anyone with the link accept an open invite, once', () => {
    const b = book();
    const c = b.create({ from: A, to: null, timeControl: tc, rated: false, color: 'random' }, 0);
    if (typeof c === 'string') throw new Error(c);
    expect(b.canAccept(c.id, C.id, 1)).toMatchObject({ id: c.id });
    b.markAccepted(c.id, 'game1', 1);
    expect(b.canAccept(c.id, B.id, 2)).toBe('not_found');
    // The link still resolves to the game for a while.
    expect(b.get(c.id, 2)).toMatchObject({ status: 'accepted', gameId: 'game1' });
    expect(b.outgoing('a')).toHaveLength(0);
  });

  it('only the challenger can cancel', () => {
    const b = book();
    const c = b.create({ from: A, to: B, timeControl: tc, rated: false, color: 'w' }, 0);
    if (typeof c === 'string') throw new Error(c);
    expect(b.cancel(c.id, 'b', 1)).toBe('not_allowed');
    expect(b.cancel(c.id, 'a', 1)).toMatchObject({ status: 'cancelled' });
  });

  it('expires pending challenges on sweep', () => {
    const b = book();
    b.create({ from: A, to: B, timeControl: tc, rated: false, color: 'w' }, 0);
    b.create({ from: A, to: null, timeControl: tc, rated: false, color: 'w' }, 0);
    expect(b.sweep(999)).toHaveLength(0);
    const expired = b.sweep(1000);
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({ status: 'expired', to: B });
    expect(b.canAccept('challenge1', 'b', 1000)).toBe('not_found');
    expect(b.size).toBe(1);
  });
});
