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

/**
 * About 20,000 well-tested puzzles from the Lichess puzzle database (CC0), rated
 * roughly 600 to 2700, shipped with the server so every install has plenty to
 * solve. `pnpm puzzles:import` adds the full database (millions) on top.
 */
export const BUNDLED_CSV = join(serverRoot, 'data', 'puzzles-lichess.csv.gz');
/** Puzzles in the bundled file: a store with fewer has not loaded it yet. */
export const BUNDLED_COUNT = 20_686;

/** Opens the store; loads the starter puzzles and the bundled set when they are missing. */
export async function openPuzzleStore(path = puzzleDbPath()): Promise<SqlitePuzzleStore> {
  const store = new SqlitePuzzleStore(path);
  if (store.count() === 0 && existsSync(SEED_CSV)) {
    await importPuzzleLines(store, await openPuzzleCsv(SEED_CSV), { source: 'chessmate', validate: true });
  }
  if (store.count() < BUNDLED_COUNT && existsSync(BUNDLED_CSV)) {
    const started = Date.now();
    console.log('Loading the bundled puzzles (once, about a minute)…');
    // Upserts by id: safe to repeat, and it never removes puzzles already there.
    const r = await importPuzzleLines(store, await openPuzzleCsv(BUNDLED_CSV), { source: 'lichess', validate: true });
    console.log(`Loaded ${r.imported} puzzles in ${Math.round((Date.now() - started) / 1000)} s (${store.count()} in total).`);
  }
  return store;
}
