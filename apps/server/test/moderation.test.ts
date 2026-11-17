import { describe, expect, it } from 'vitest';
import { Moderation } from '../src/moderation';

const alice = { id: 'a', name: 'Alice' };
const bob = { id: 'b', name: 'Bob' };

function setup() {
  let t = 1_000_000;
  const mod = new Moderation(undefined, () => t);
  return { mod, advance: (ms: number) => (t += ms) };
}

describe('Moderation', () => {
  it('filters chat, resolves quick messages and keeps a game log', () => {
    const { mod } = setup();
    const r1 = mod.chat(alice, 'g1', { text: 'you shit player' });
    expect(r1).toMatchObject({ ok: true, line: { text: 'you s*** player', filtered: true, playerId: 'a' } });
    const r2 = mod.chat(bob, 'g1', { quick: 'good_game' });
    expect(r2).toMatchObject({ ok: true, line: { text: 'Good game!', quick: 'good_game' } });
    expect(mod.chat(bob, 'g1', { quick: 'made_up' })).toMatchObject({ ok: false, code: 'bad_request' });
    expect(mod.chat(bob, 'g1', { text: '   ' })).toMatchObject({ ok: false, code: 'bad_request' });
    expect(mod.chatLog('g1').map((l) => l.text)).toEqual(['you s*** player', 'Good game!']);
    mod.forgetGame('g1');
    expect(mod.chatLog('g1')).toEqual([]);
  });

  it('rate-limits chat', () => {
    const { mod, advance } = setup();
    for (let i = 0; i < 5; i++) expect(mod.chat(alice, 'g', { text: `m${i}` }).ok).toBe(true);
    expect(mod.chat(alice, 'g', { text: 'spam' })).toMatchObject({ ok: false, code: 'rate_limited' });
    advance(10_001);
    expect(mod.chat(alice, 'g', { text: 'ok again' }).ok).toBe(true);
  });

  it('files reports with chat evidence, deduplicates, and blocks self-reports', () => {
    const { mod } = setup();
    mod.chat(bob, 'g', { text: 'rude stuff' });
    const r = mod.report(alice, bob, { gameId: 'g', reason: 'abusive_chat', note: 'see chat', moves: ['e2e4'] });
    expect(r).toMatchObject({ ok: true, report: { targetId: 'b', status: 'open', moves: ['e2e4'] } });
    if (!r.ok) throw new Error();
    expect(r.report.chat.map((l) => l.text)).toEqual(['rude stuff']);
    const again = mod.report(alice, bob, { gameId: 'g', reason: 'abusive_chat' });
    expect(again.ok && again.report.id).toBe(r.report.id);
    expect(mod.report(alice, alice, { reason: 'other' })).toMatchObject({ ok: false });
    expect(mod.report(alice, bob, { reason: 'nonsense' })).toMatchObject({ ok: false, code: 'bad_request' });
  });

  it('chat bans from a report expire and can be lifted', () => {
    const { mod, advance } = setup();
    const r = mod.report(alice, bob, { gameId: 'g', reason: 'abusive_chat' });
    if (!r.ok) throw new Error();
    const resolved = mod.resolve(r.report.id, 'chat_ban', { by: 'admin', durationHours: 1 });
    expect(resolved?.status).toBe('actioned');
    expect(mod.chat(bob, 'g', { text: 'hi' })).toMatchObject({ ok: false, code: 'chat_restricted' });
    advance(3600_001);
    expect(mod.chat(bob, 'g', { text: 'hi' }).ok).toBe(true);
    mod.ban('b', 'Bob', 5, 'x');
    mod.resolve(r.report.id, 'unban', { by: 'admin' });
    expect(mod.activeBan('b')).toBeUndefined();
    expect(mod.resolve('missing', 'dismiss', { by: 'admin' })).toBeNull();
  });
});
