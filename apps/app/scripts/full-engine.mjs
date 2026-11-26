// Adds the full Stockfish.js build (single-threaded WASM with the big NNUE net,
// GPLv3) to a web build, for players on computers who pick it in Settings. The
// app ships with the lite build (see vendor-engine.mjs); this one is 99 MB, too
// big to keep in git or to serve as one file from Cloudflare Pages (25 MiB per
// file), so it is copied from node_modules at build time and split in parts
// that the app joins again on the player's computer (transport.web.ts).
//
//   node apps/app/scripts/full-engine.mjs           into apps/app/dist (after expo export)
//   node apps/app/scripts/full-engine.mjs public    into apps/app/public, for `pnpm web` (git ignores it)
//
// Writes <out>/engine/full/: stockfish.js, stockfish.wasm.0 … .N, manifest.json, COPYING.txt.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Bytes per part: well under Cloudflare Pages' 25 MiB limit per file. */
const PART = 20_000_000;

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(app, 'package.json'));
const root = dirname(require.resolve('stockfish/package.json'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const major = String(pkg.version).split('.')[0];
const base = join(root, 'bin', `stockfish-${major}-single`);

const out = join(app, process.argv[2] ?? 'dist', 'engine', 'full');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(`${base}.js`, join(out, 'stockfish.js'));
copyFileSync(join(root, 'Copying.txt'), join(out, 'COPYING.txt'));
const wasm = readFileSync(`${base}.wasm`);
const parts = [];
for (let at = 0, i = 0; at < wasm.length; at += PART, i++) {
  const name = `stockfish.wasm.${i}`;
  writeFileSync(join(out, name), wasm.subarray(at, at + PART));
  parts.push(name);
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ version: pkg.version, bytes: wasm.length, parts }));
console.log(`Full Stockfish.js ${pkg.version}: ${(wasm.length / 1e6).toFixed(0)} MB in ${parts.length} parts → ${out}`);
