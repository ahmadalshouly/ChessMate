import { parseTimeControl } from '@chessmate/core';
import { describe, expect, it, vi } from 'vitest';
import { FIRST_MOVE_TIMEOUT_MS, GameRoom } from '../src/gameRoom';
import { Matchmaker, whiteOf } from '../src/matchmaker';

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
  });

  it('tells clients when each first move is due', () => {
    const { r } = room();
    expect(r.snapshot(0).firstMoveDeadline).toBe(FIRST_MOVE_TIMEOUT_MS);
    r.move('w', 'e2e4', 0, 5000);
    expect(r.snapshot(5000).firstMoveDeadline).toBe(5000 + FIRST_MOVE_TIMEOUT_MS);
    r.move('b', 'e7e5', 1, 9000);
    expect(r.snapshot(9000).firstMoveDeadline).toBeNull();
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

  it('keeps colour preferences', () => {
    const m = new Matchmaker();
    m.add({ playerId: 'a', rating: 1500, timeControl: tc, rated: true, createdAt: 0, color: 'w' });
    m.add({ playerId: 'b', rating: 1500, timeControl: tc, rated: true, createdAt: 0, color: 'w' });
    expect(m.tick(0)).toHaveLength(0);
    m.add({ playerId: 'c', rating: 1500, timeControl: tc, rated: true, createdAt: 0 });
    const [p] = m.tick(0);
    expect(p).toBeDefined();
    expect(whiteOf(p!).color).toBe('w');
    expect(whiteOf({ a: { ...p!.a, color: undefined }, b: { ...p!.b, color: 'b' } }, () => false)).toBe(p!.a);
  });

  it('does not pair different time controls', () => {
    const m = new Matchmaker();
    m.add({ playerId: 'a', rating: 1500, timeControl: tc, rated: true, createdAt: 0 });
    m.add({ playerId: 'b', rating: 1500, timeControl: parseTimeControl('3+2'), rated: true, createdAt: 0 });
    expect(m.tick(60_000)).toHaveLength(0);
  });
});
