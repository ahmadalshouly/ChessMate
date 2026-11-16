import { parsePuzzleCsvLine, type Puzzle } from '@chessmate/core';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import type { PuzzleStore } from './store';

/** Official CC0 export: https://database.lichess.org/#puzzles */
export const LICHESS_PUZZLE_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';

export interface ImportOptions {
  /** Skip puzzles players disliked (popularity is -100..100). */
  minPopularity?: number;
  /** Skip puzzles with too few plays to have a trustworthy rating. */
  minPlays?: number;
  /** Skip puzzles whose rating is still very uncertain. */
  maxRatingDeviation?: number;
  /** Stop after this many accepted puzzles. */
  limit?: number;
  /** Replay every move with the rules engine (slower, catches corrupt rows). */
  validate?: boolean;
  batchSize?: number;
  source?: string;
  onProgress?: (p: ImportProgress) => void;
}

export interface ImportProgress {
  read: number;
  imported: number;
  skipped: number;
}

export const DEFAULT_IMPORT: Required<Pick<ImportOptions, 'minPopularity' | 'minPlays' | 'maxRatingDeviation'>> = {
  minPopularity: 50,
  minPlays: 100,
  maxRatingDeviation: 100,
};

function keep(p: Puzzle, o: ImportOptions): boolean {
  return (
    p.popularity >= (o.minPopularity ?? -100) && p.plays >= (o.minPlays ?? 0) && p.ratingDeviation <= (o.maxRatingDeviation ?? Infinity)
  );
}

/** Streams CSV lines into the store in batched transactions. */
export async function importPuzzleLines(store: PuzzleStore, lines: AsyncIterable<string>, opts: ImportOptions = {}): Promise<ImportProgress> {
  const batchSize = opts.batchSize ?? 5000;
  const progress: ImportProgress = { read: 0, imported: 0, skipped: 0 };
  let batch: Puzzle[] = [];
  const flush = () => {
    if (batch.length) store.insertMany(batch, opts.source);
    progress.imported += batch.length;
    batch = [];
    opts.onProgress?.({ ...progress });
  };
  for await (const line of lines) {
    if (!line || line.startsWith('PuzzleId,')) continue;
    progress.read++;
    const p = parsePuzzleCsvLine(line, { validate: opts.validate });
    if (!p || !keep(p, opts)) {
      progress.skipped++;
      continue;
    }
    batch.push(p);
    if (opts.limit && progress.imported + batch.length >= opts.limit) break;
    if (batch.length >= batchSize) flush();
  }
  flush();
  return progress;
}

/**
 * Opens a puzzle CSV from a local path or an http(s) URL. Handles plain
 * `.csv`, `.csv.gz` and the official `.csv.zst` (Node 22.15+ has zstd).
 */
export async function openPuzzleCsv(pathOrUrl: string): Promise<AsyncIterable<string>> {
  let input: Readable;
  if (/^https?:\/\//.test(pathOrUrl)) {
    const res = await fetch(pathOrUrl);
    if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status} for ${pathOrUrl}`);
    input = Readable.fromWeb(res.body as never);
  } else {
    input = createReadStream(pathOrUrl);
  }
  if (pathOrUrl.endsWith('.zst')) {
    const z = zlib as unknown as { createZstdDecompress?: () => NodeJS.ReadWriteStream };
    if (!z.createZstdDecompress) throw new Error('This Node version cannot read .zst files. Use Node 22.15+ or decompress first (zstd -d).');
    input = input.pipe(z.createZstdDecompress()) as unknown as Readable;
  } else if (pathOrUrl.endsWith('.gz')) {
    input = input.pipe(zlib.createGunzip());
  }
  return createInterface({ input, crlfDelay: Infinity });
}
