// Compiles the game server for production: node dist/main.js
// Our own code (server + @chessmate/core, which ships as TypeScript source)
// is bundled; npm dependencies stay external and are installed next to it
// (see the Dockerfile's `pnpm deploy --prod`), so packages that load files
// at runtime (WASM, migrations, native addons) keep working.
import { build } from 'esbuild';

/** Keep bare npm imports external, but inline our workspace packages. */
const externalizeNpm = {
  name: 'externalize-npm',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith('@chessmate/') || args.path.startsWith('node:')) return undefined;
      return { path: args.path, external: true };
    });
  },
};

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  plugins: [externalizeNpm],
  logLevel: 'info',
});
