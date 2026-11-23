import { createUser, openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HabitsError, PlayHabitsService } from '../src/habits/service';

let h: DbHandle;
let clock = Date.UTC(2026, 10, 2, 9, 0);
const now = () => clock;
let user: string;

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  user = (await createUser(h.db, { username: 'focus' })).id;
}, 60_000);

afterAll(async () => {
  await h.close();
});

describe('play limits (server)', () => {
  it('locks after the limit, refuses loosening during the break, survives a restart, and lifts on time', async () => {
    const svc = new PlayHabitsService({ db: h.db, now });
    await svc.update(user, { enabled: true, maxGames: 2, windowMinutes: 60, cooldownMinutes: 30 });
    expect((await svc.gameFinished(user)).lockedNow).toBe(false);
    clock += 5 * 60_000;
    const second = await svc.gameFinished(user);
    expect(second.lockedNow).toBe(true);
    expect(svc.lockOf(user)).toBe(clock + 30 * 60_000);

    for (const loosen of [{ enabled: false }, { maxGames: 3 }, { cooldownMinutes: 10 }, { windowMinutes: 30 }]) {
      const e = await svc.update(user, loosen).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(HabitsError);
      expect((e as HabitsError).status).toBe(403);
    }
    // Stricter is fine during a break.
    expect((await svc.update(user, { maxGames: 1, cooldownMinutes: 60 })).limits).toMatchObject({ maxGames: 1, cooldownMinutes: 60 });

    // A restarted server still knows about the break.
    const restarted = new PlayHabitsService({ db: h.db, now });
    await restarted.load();
    expect(restarted.lockOf(user)).toBe(svc.lockOf(user));

    clock += 31 * 60_000;
    expect(restarted.lockOf(user)).toBeNull();
    expect((await restarted.update(user, { enabled: false })).limits.enabled).toBe(false);
  });

  it('keeps a streak across days and counts computer games at most once a minute', async () => {
    const other = (await createUser(h.db, { username: 'streaker' })).id;
    const svc = new PlayHabitsService({ db: h.db, now });
    expect((await svc.computerGame(other, 4)).view.streak.days).toBe(0); // too short to count
    expect((await svc.computerGame(other, 30)).view.streak.days).toBe(1);
    clock += 20 * 3600_000;
    expect((await svc.gameFinished(other)).view.streak.days).toBe(2);
    clock += 25 * 3600_000;
    expect((await svc.view(other)).streak.days).toBe(0);
  });
});
