// Expo watches the whole monorepo. Keep Metro away from folders that change at
// runtime but are not app code: the dev server's embedded database (.data) and
// local tool state (.ruv-swarm). Database writes there otherwise trigger hot
// reloads until Metro crashes with EMFILE (too many open files) on Windows.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Matches both absolute and root-relative paths (outside node_modules).
const ignored = [/^(?!.*node_modules)(?:.*[\\/])?\.(?:data|ruv-swarm)[\\/].*/];

const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...ignored,
];

module.exports = config;
