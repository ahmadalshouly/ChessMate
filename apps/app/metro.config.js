// Expo watches the whole monorepo. Keep Metro away from folders that are not app
// code: the dev server's embedded database (.data) and local tool state
// (.ruv-swarm) change at runtime, and the server, docs, scripts, artwork sources
// and git data are never bundled. Without Watchman (Windows) Metro holds a file
// watch on every folder it sees; skipping these keeps it well under the open-file
// limit, so a database write or a large `git pull` no longer crashes it with
// EMFILE (too many open files).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const root = path.resolve(__dirname, '..', '..');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A folder of the repo and everything in it, with either kind of slash (Windows or not). */
function folder(rel) {
  const full = path.join(root, rel);
  const parts = full.split(/[\\/]+/).filter(Boolean).map(escape);
  const lead = /^[\\/]/.test(full) ? '[\\\\/]' : '';
  return new RegExp(`^${lead}${parts.join('[\\\\/]')}[\\\\/].*`);
}

const ignored = [
  // Matches both absolute and root-relative paths (outside node_modules).
  /^(?!.*node_modules)(?:.*[\\/])?\.(?:data|ruv-swarm|expo)[\\/].*/,
  ...['.git', 'apps/server', 'packages/db', 'docs', 'scripts', 'apps/app/art', 'apps/app/scripts', 'coverage'].map(folder),
];

const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...ignored,
];

// The on-device engine (src/features/engine) ships its WebAssembly and worker
// script as plain files that the iOS/Android app reads and hands to a WebView.
config.resolver.assetExts = [...new Set([...config.resolver.assetExts, 'wasm', 'txt'])];

module.exports = config;
