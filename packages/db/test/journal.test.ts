import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const journal = JSON.parse(readFileSync(fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url)), 'utf8')) as {
  entries: { idx: number; when: number; tag: string }[];
};

describe('migration journal', () => {
  // Drizzle only applies a migration whose `when` is later than the last one a database already ran,
  // so a new entry with an earlier `when` is silently skipped on existing databases.
  it('every migration is later than the one before it', () => {
    for (let i = 1; i < journal.entries.length; i++) {
      const prev = journal.entries[i - 1]!;
      const cur = journal.entries[i]!;
      expect(cur.when, `${cur.tag} must be later than ${prev.tag}`).toBeGreaterThan(prev.when);
    }
  });
});
