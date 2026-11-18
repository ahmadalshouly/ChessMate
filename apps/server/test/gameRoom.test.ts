import { parseTimeControl } from '@chessmate/core';
import { describe, expect, it, vi } from 'vitest';
import { FIRST_MOVE_TIMEOUT_MS, GameRoom } from '../src/gameRoom';
import { Matchmaker, pairingColors } from '../src/matchmaker';

const W = { id: 'w', name: 'White', rating: 1500, provisional: true };
const B = { id: 'b', name: 'Black', rating: 1500, provisional: true };

function room(tc = '1+0') {
  const events = { onMove: vi.fn(), onEnd: vi.fn(), onDrawOffer: vi.fn() };
  return { r: new GameRoom('g1', W, B, parseTimeControl(tc), true, 0, events), events };
}

describe('GameRoom', () => {
  it('enforces turn order and ply', () => {
    const { r } = room();
    expect(r.move('b', 'e7e5', 0, 1)).toBe('not_your_turn');
    expect(r.move('w', 'e2e4', 1, 1)).toBe('stale_ply');
    expect(r.move('w', 'e2e5', 0, 1)).toBe('illegal_move');
    expect(typeof r.move('w', 'e2e4', 0, 1)).toBe('object');
  });

  it('ends on checkmate', () => {
    const { r, events } = room();
    r.move('w', 'f2f3', 0, 1);
    r.move('b', 'e7e5', 1, 2);
    r.move('w', 'g2g4', 2, 3);
    r.move('b', 'd8h4', 3, 4);
    expect(r.outcome?.reason).toBe('checkmate');
    expect(events.onEnd).toHaveBeenCalledOnce();
  });

  it('flags on time once clocks run', () => {
    const { r } = room('1+0');
    r.move('w', 'e2e4', 0, 1000);
    r.move('b', 'e7e5', 1, 2000); // white clock starts at 2000
    expect(r.checkTime(2000 + 59_000)).toBe(false);
    expect(r.checkTime(2000 + 60_001)).toBe(true);
    expect(r.outcome).toMatchObject({ reason: 'timeout', winner: 'b' });
  });

  it('aborts when nobody moves', () => {
    const { r } = room();
    expect(r.checkTime(FIRST_MOVE_TIMEOUT_MS + 1)).toBe(true);
    expect(r.outcome?.reason).toBe('aborted');
    expect(r.noFirstMove).toBe('w');
  });

  it('gives each side 30 seconds for its first move', () => {
    const { r } = room();
    expect(r.firstMoveDeadline).toBe(FIRST_MOVE_TIMEOUT_MS);
    expect(r.snapshot(0).firstMoveDeadline).toBe(FIRST_MOVE_TIMEOUT_MS);
    r.move('w', 'e2e4', 0, 10_000);
    // Black's 30 seconds start at white's move.
    expect(r.firstMoveDeadline).toBe(10_000 + FIRST_MOVE_TIMEOUT_MS);
    expect(r.checkTime(10_000 + FIRST_MOVE_TIMEOUT_MS)).toBe(false);
    expect(r.checkTime(10_000 + FIRST_MOVE_TIMEOUT_MS + 1)).toBe(true);
    expect(r.outcome?.reason).toBe('aborted');
    expect(r.noFirstMove).toBe('b');
  });

  it('stops the first-move timer once both sides have moved', () => {
    const { r } = room('5+0');
    r.move('w', 'e2e4', 0, 1000);
    r.move('b', 'e7e5', 1, 2000);
    expect(r.firstMoveDeadline).toBeNull();
    expect(r.checkTime(2000 + FIRST_MOVE_TIMEOUT_MS + 5)).toBe(false);
  });

  it('handles draw offers and resignations', () => {
    const { r } = room();
    r.move('w', 'e2e4', 0, 1);
    r.move('b', 'e7e5', 1, 2);
    expect(r.acceptDraw('b', 3)).toBe(false);
    expect(r.offerDraw('w')).toBe(true);
    expect(r.acceptDraw('w', 3)).toBe(false);
    expect(r.acceptDraw('b', 3)).toBe(true);
    expect(r.outcome?.reason).toBe('draw_agreement');
    const { r: r2 } = room();
    r2.move('w', 'e2e4', 0, 1);
    r2.move('b', 'e7e5', 1, 2);
    r2.resign('w', 3);
    expect(r2.outcome).toMatchObject({ result: '0-1', reason: 'resignation' });
  });
});

describe('Matchmaker', () => {
  const tc = parseTimeControl('5+0');
  it('pairs close ratings immediately and widens over time', () => {
    const m = new Matchmaker();
    m.add({ playerId: 'a', rating: 1500, timeControl: tc, rated: true, createdAt: 0 });
    m.add({ playerId: 'b', rating: 1900, timeControl: tc, rated: true, createdAt: 0 });
    expect(m.tick(0)).toHaveLength(0);
    expect(m.tick(20_000)).toHaveLength(1);
    expect(m.size).toBe(0);
  });

  it('honours colour choices and never pairs two players wanting the same side', () => {
    const m = new Matchmaker();
    m.add({ playerId: 'a', rating: 1500, timeControl: tc, rated: true, createdAt: 0, color: 'w' });
    m.add({ playerId: 'b', rating: 1500, timeControl: tc, rated: true, createdAt: 0, color: 'w' });
    expect(m.tick(0)).toHaveLength(0);
    m.add({ playerId: 'c', rating: 1500, timeControl: tc, rated: true, createdAt: 0, color: 'random' });
    const [p] = m.tick(0);
    expect(p).toBeDefined();
    const [white, black] = pairingColors(p!.a, p!.b, p!.a.playerId, p!.b.playerId, () => 0.9);
    expect(white === 'a' || white === 'b').toBe(true);
    expect(black).toBe('c');
    const black1 = { playerId: 'x', rating: 1, timeControl: tc, rated: true, createdAt: 0, color: 'b' as const };
    const any = { playerId: 'y', rating: 1, timeControl: tc, rated: true, createdAt: 0 };
    expect(pairingColors(any, black1, 'y', 'x', () => 0)).toEqual(['y', 'x']);
    expect(pairingColors(black1, any, 'x', 'y', () => 0)).toEqual(['y', 'x']);
  });

  it('does not pair different time controls', () => {
    const m = new Matchmaker();
    m.add({ playerId: 'a', rating: 1500, timeControl: tc, rated: true, createdAt: 0 });
    m.add({ playerId: 'b', rating: 1500, timeControl: parseTimeControl('3+2'), rated: true, createdAt: 0 });
    expect(m.tick(60_000)).toHaveLength(0);
  });
});
