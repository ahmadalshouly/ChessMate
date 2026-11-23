// Serves the built web app (apps/app/dist) to every device on your network.
//
//   pnpm web:lan          builds the web app, then serves it
//   pnpm web:serve        serves the last build again (no rebuild)
//
// Unlike the development server (Metro), nothing here watches files, so any
// number of phones, tablets and computers can open it at once without the
// "EMFILE: too many open files" crash on Windows. Changes to the code need a new
// build (pnpm web:lan). The game server (pnpm dev:server) must be running; the
// app finds it on the same address, port 8787.
//
// Options: PORT=8080 (default), DIST=apps/app/dist.
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(root, process.env.DIST ?? 'apps/app/dist');
const PORT = Number(process.env.PORT ?? 8080);

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`No web build in ${DIST}. Run "pnpm web:lan" (builds and serves) or "pnpm build:web" first.`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};
const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const entries = (d) => {
  try {
    return readdirSync(d);
  } catch {
    return [];
  }
};

/**
 * The page for a path in an Expo Router static export: exact files first, then
 * dynamic segments ("[id]"), catch-alls ("[...rest]") and route groups ("(tabs)").
 */
function findPage(dir, parts) {
  const groups = entries(dir).filter((f) => f.startsWith('(') && isDir(join(dir, f)));
  if (parts.length === 0) {
    for (const c of ['index.html']) if (isFile(join(dir, c))) return join(dir, c);
    for (const g of groups) {
      const hit = findPage(join(dir, g), parts);
      if (hit) return hit;
    }
    return null;
  }
  const [seg, ...rest] = parts;
  const names = entries(dir);
  if (rest.length === 0) {
    for (const c of [`${seg}.html`, join(seg, 'index.html')]) if (isFile(join(dir, c))) return join(dir, c);
  }
  if (isDir(join(dir, seg))) {
    const hit = findPage(join(dir, seg), rest);
    if (hit) return hit;
  }
  for (const g of groups) {
    const hit = findPage(join(dir, g), parts);
    if (hit) return hit;
  }
  const dynamic = names.filter((f) => /^\[(?!\.\.\.)[^\]]+\](\.html)?$/.test(f));
  for (const f of dynamic) {
    if (f.endsWith('.html') && rest.length === 0) return join(dir, f);
    if (!f.endsWith('.html') && isDir(join(dir, f))) {
      const hit = findPage(join(dir, f), rest);
      if (hit) return hit;
    }
  }
  const catchAll = names.find((f) => /^\[\.\.\.[^\]]+\]\.html$/.test(f));
  return catchAll ? join(dir, catchAll) : null;
}

function resolveRequest(urlPath) {
  let path;
  try {
    path = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const file = resolve(DIST, `.${path}`);
  if (!file.startsWith(DIST + sep) && file !== DIST) return null;
  if (isFile(file)) return file;
  const parts = path.split('/').filter(Boolean);
  return findPage(DIST, parts) ?? (isFile(join(DIST, '+not-found.html')) ? join(DIST, '+not-found.html') : join(DIST, 'index.html'));
}

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  const file = resolveRequest(req.url ?? '/');
  if (!file) {
    res.writeHead(400).end();
    return;
  }
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  // Hashed bundles never change; pages always load the newest build.
  const cache = file.includes(`${sep}_expo${sep}static${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'content-type': type, 'cache-control': cache });
  if (req.method === 'HEAD') return void res.end();
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => `http://${n.address}:${PORT}`);
  console.log(`ChessMate web is being served from ${DIST}`);
  console.log(`  On this computer:   http://localhost:${PORT}`);
  for (const u of lan) console.log(`  On other devices:   ${u}`);
  console.log('Keep the game server running too (pnpm dev:server). Press Ctrl+C to stop.');
});
