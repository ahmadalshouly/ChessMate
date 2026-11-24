import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { openDb } from '../src';

/** Tables that exist, by name. */
async function tables(db: ReturnType<typeof openDb>['db']): Promise<string[]> {
  const r = (await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public'`)) as unknown as { rows: { table_name: string }[] };
  return r.rows.map((x) => x.table_name);
}

describe('lessons migration on existing databases', () => {
  // A development database that ran an unmerged branch's 0021 has its last migration at 0021's old time;
  // Drizzle skips anything not later than that, so the lessons migration must come after it.
  it('creates the lesson tables when another 0021 already ran', async () => {
    const h = openDb({ path: 'memory://' });
    await h.migrate();
    await h.db.execute(sql`drop table "lessons"`);
    await h.db.execute(sql`drop table "lesson_chapters"`);
    await h.db.execute(sql`delete from drizzle.__drizzle_migrations where created_at >= 1797100000000`);
    await h.db.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('other-0021', 1797100000000)`);
    await h.migrate();
    expect(await tables(h.db)).toEqual(expect.arrayContaining(['lessons', 'lesson_chapters']));
    await h.close();
  });

  // A database that already ran the first version of the lessons migration runs it again; it must not fail.
  it('runs again on a database that already has the lesson tables', async () => {
    const h = openDb({ path: 'memory://' });
    await h.migrate();
    await h.db.execute(sql`delete from drizzle.__drizzle_migrations where created_at >= 1797100000000`);
    await h.db.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('lessons-v1', 1797100000000)`);
    await expect(h.migrate()).resolves.toBeUndefined();
    expect(await tables(h.db)).toEqual(expect.arrayContaining(['lessons', 'lesson_chapters']));
    await h.close();
  });
});
