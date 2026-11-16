import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPuzzleLines, openPuzzleCsv } from './importer';
import { SqlitePuzzleStore } from './store';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Puzzle database file; override with PUZZLE_DB. */
export function puzzleDbPath(): string {
  return process.env.PUZZLE_DB ?? join(serverRoot, 'data', 'puzzles.db');
}

/** Small set of original puzzles so a fresh checkout works before importing. */
export const SEED_CSV = join(serverRoot, 'data', 'puzzles-seed.csv');

/** Opens the store and loads the dev seed when it is empty. */
export async function openPuzzleStore(path = puzzleDbPath()): Promise<SqlitePuzzleStore> {
  const store = new SqlitePuzzleStore(path);
  if (store.count() === 0 && existsSync(SEED_CSV)) {
    await importPuzzleLines(store, await openPuzzleCsv(SEED_CSV), { source: 'chessmate', validate: true });
  }
  return store;
}
