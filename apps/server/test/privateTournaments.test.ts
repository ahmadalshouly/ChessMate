import { createUser, openDb, type DbHandle } from '@chessmate/db';
import { validateTournamentInput } from '@chessmate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TournamentService, type TournamentBridge } from '../src/tournaments/service';

let h: DbHandle;
let clock = Date.UTC(2026, 10, 24, 9, 0);
const now = () => clock;
const ids: Record<string, string> = {};

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  for (const name of ['Alice', 'bob', 'carol', 'dave']) ids[name] = (await createUser(h.db, { username: name })).id;
}, 60_000);

afterAll(async () => {
  await h.close();
});

function harness(svc: TournamentService) {
  const started: [string, string][] = [];
  const notices: { userId: string; title: string }[] = [];
  const busy = new Set<string>();
  let n = 0;
  const bridge: TournamentBridge = {
    isOnline: () => true,
    liveGameOf: (id) => (busy.has(id) ? 'busy' : null),
    rating: () => ({ rating: 1500, games: 50 }),
    startGame: (white, black) => {
      started.push([white, black]);
      busy.add(white).add(black);
      return `pg${++n}`;
    },
    notify: (userId, title) => notices.push({ userId, title }),
  };
  svc.attach(bridge, 1e9);
  return { started, notices };
}

const base = { name: 'Invite cup', timeControl: { initialMs: 180_000, incrementMs: 0 }, durationMinutes: 30 };

describe('private tournaments', () => {
  it('validates the invite list', () => {
    const at = clock + 60_000;
    expect(validateTournamentInput({ ...base, startsAt: at, private: true, invited: ['alice'] }, clock)).toMatchObject({ field: 'invited' });
    const ok = validateTournamentInput({ ...base, startsAt: at, private: true, invited: ['@alice', 'Alice', ' bob '] }, clock);
    expect(ok).toMatchObject({ value: { private: true, invited: ['alice', 'bob'] } });
    // Open tournaments ignore a stray list.
    expect(validateTournamentInput({ ...base, startsAt: at, invited: ['alice', 'bob'] }, clock)).toMatchObject({ value: { private: false, invited: [] } });
  });

  it('rejects usernames that do not exist', async () => {
    const svc = new TournamentService({ db: h.db, now });
    harness(svc);
    await expect(svc.create({ ...base, startsAt: clock + 60_000, private: true, invited: ['alice', 'nobody_here'] }, 'staff')).rejects.toThrow('No player named nobody_here');
    svc.stop();
  });

  it('only invited players join, play and chat; everyone can watch', async () => {
    const svc = new TournamentService({ db: h.db, now });
    const { started, notices } = harness(svc);
    const t = await svc.create({ ...base, startsAt: clock + 60_000, private: true, invited: ['alice', 'BOB'] }, 'staff');
    expect(t.private).toBe(true);
    expect(t.invited.map((x) => x.username).sort()).toEqual(['Alice', 'bob']);
    expect(notices.map((x) => x.userId).sort()).toEqual([ids.Alice, ids.bob].sort());

    // Outsiders see it, see why they cannot join, and are refused by the server.
    expect(svc.list(ids.carol!).find((x) => x.id === t.id)).toMatchObject({ private: true });
    expect(svc.detail(ids.carol!, t.id).you).toMatchObject({ blocked: 'This tournament is invite-only', invited: false });
    await expect(svc.join(ids.carol!, t.id, { acceptRules: true })).rejects.toThrow('This tournament is invite-only');
    await expect(svc.postChat(ids.carol!, t.id, { text: 'hello' })).rejects.toThrow('Only invited players can chat');

    await svc.join(ids.Alice!, t.id, { acceptRules: true });
    await svc.join(ids.bob!, t.id, { acceptRules: true });
    expect(svc.detail(ids.bob!, t.id).you).toMatchObject({ blocked: null, invited: true });
    await svc.postChat(ids.bob!, t.id, { text: 'good luck' });
    await svc.postChat('staff', t.id, { text: 'welcome' }, { staff: true, username: 'Staff' });
    expect(svc.chat(t.id)).toHaveLength(2);

    await svc.startNow(t.id);
    expect(started).toHaveLength(1);
    expect(new Set(started[0])).toEqual(new Set([ids.Alice, ids.bob]));
    const view = svc.detail(null, t.id);
    expect(view.liveGames).toHaveLength(1);
    expect(view.standings).toHaveLength(2);
    svc.stop();
  });

  it('staff can change the list: new invitees join, removed players stop being paired', async () => {
    const svc = new TournamentService({ db: h.db, now });
    const { notices } = harness(svc);
    const t = await svc.create({ ...base, startsAt: clock + 60_000, private: true, invited: ['alice', 'bob'] }, 'staff');
    await svc.join(ids.bob!, t.id, { acceptRules: true });
    notices.length = 0;
    const edited = await svc.update(t.id, { private: true, invited: ['alice', 'carol', 'dave'] });
    expect(edited.invited.map((x) => x.username).sort()).toEqual(['Alice', 'carol', 'dave']);
    expect(notices.map((x) => x.userId).sort()).toEqual([ids.carol, ids.dave].sort());
    await svc.join(ids.carol!, t.id, { acceptRules: true });
    expect(svc.detail(ids.bob!, t.id)).toMatchObject({ joined: false, you: { blocked: 'This tournament is invite-only' } });
    await expect(svc.join(ids.bob!, t.id, { acceptRules: true })).rejects.toThrow('invite-only');

    // Once it runs it stays private, even if an edit leaves the flag out.
    await svc.startNow(t.id);
    const still = await svc.update(t.id, { name: 'Invite cup II' });
    expect(still).toMatchObject({ private: true, name: 'Invite cup II' });
    expect(still.invited).toHaveLength(3);
    svc.stop();
  });

  it('open tournaments are unchanged', async () => {
    const svc = new TournamentService({ db: h.db, now });
    harness(svc);
    const t = await svc.create({ ...base, startsAt: clock + 60_000 }, 'staff');
    expect(t).toMatchObject({ private: false, invited: [] });
    await svc.join(ids.carol!, t.id, { acceptRules: true });
    expect(svc.detail(ids.carol!, t.id)).toMatchObject({ joined: true, you: { invited: false } });
    svc.stop();
  });
});
