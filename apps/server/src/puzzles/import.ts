/**
 * Imports the CC0 Lichess puzzle database into the puzzle store.
 *
 *   pnpm puzzles:import                       # download the official file
 *   pnpm puzzles:import ./lichess_db_puzzle.csv.zst
 *   pnpm puzzles:import --limit 50000 --min-plays 500
 *
 * Re-running is safe: puzzles are upserted by id.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_IMPORT, LICHESS_PUZZLE_URL, importPuzzleLines, openPuzzleCsv } from './importer';
import { SqlitePuzzleStore } from './store';
import { puzzleDbPath } from './setup';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    db: { type: 'string' },
    limit: { type: 'string' },
    'min-popularity': { type: 'string' },
    'min-plays': { type: 'string' },
    'max-rd': { type: 'string' },
    validate: { type: 'boolean', default: false },
  },
});

// pnpm runs scripts inside apps/server; resolve paths from where the user typed the command.
const cwd = process.env.INIT_CWD ?? process.cwd();
const arg = positionals[0];
const source = !arg ? LICHESS_PUZZLE_URL : /^https?:\/\//.test(arg) ? arg : resolve(cwd, arg);
const dbPath = values.db ? resolve(cwd, values.db) : puzzleDbPath();
const num = (v: string | undefined, d?: number) => (v === undefined ? d : Number(v));

const store = new SqlitePuzzleStore(dbPath);
console.log(`Importing puzzles from ${source}\ninto ${dbPath}`);
const started = Date.now();
const result = await importPuzzleLines(store, await openPuzzleCsv(source), {
  limit: num(values.limit),
  minPopularity: num(values['min-popularity'], DEFAULT_IMPORT.minPopularity),
  minPlays: num(values['min-plays'], DEFAULT_IMPORT.minPlays),
  maxRatingDeviation: num(values['max-rd'], DEFAULT_IMPORT.maxRatingDeviation),
  validate: values.validate,
  onProgress: (p) => process.stdout.write(`\r  read ${p.read.toLocaleString()}  imported ${p.imported.toLocaleString()}  skipped ${p.skipped.toLocaleString()}`),
});
console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)}s: ${result.imported.toLocaleString()} puzzles, ${store.count().toLocaleString()} in store.`);
store.close();
