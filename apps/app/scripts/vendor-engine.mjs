// Copies the on-device engine (Stockfish.js "lite single-threaded" WASM build,
// GPLv3) out of node_modules into the app. Run after upgrading the `stockfish`
// dev dependency:  node apps/app/scripts/vendor-engine.mjs
//
//   public/engine/stockfish.js|.wasm   served as-is to web browsers (a Web Worker)
//   src/features/engine/assets/stockfish.js.txt
//                                      the same script for the iOS/Android app, which
//                                      runs it in a WebView with public/engine/stockfish.wasm
//
// The engine runs as its own program in a worker and only talks UCI text with
// the app, the same arrangement as the server's Stockfish process.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(app, 'package.json'));
const root = dirname(require.resolve('stockfish/package.json'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const major = String(pkg.version).split('.')[0];
const base = join(root, 'bin', `stockfish-${major}-lite-single`);

const web = join(app, 'public', 'engine');
const native = join(app, 'src', 'features', 'engine', 'assets');
mkdirSync(web, { recursive: true });
mkdirSync(native, { recursive: true });
copyFileSync(`${base}.js`, join(web, 'stockfish.js'));
copyFileSync(`${base}.wasm`, join(web, 'stockfish.wasm'));
copyFileSync(join(root, 'Copying.txt'), join(web, 'COPYING.txt'));
// Metro would compile a .js file as app code; these are read as plain files instead.
copyFileSync(`${base}.js`, join(native, 'stockfish.js.txt'));
console.log(`Vendored Stockfish.js ${pkg.version} (lite, single-threaded).`);
