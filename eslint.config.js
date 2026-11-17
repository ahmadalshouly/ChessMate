// Flat ESLint config for the whole monorepo (app, server, core).
// Expo's preset covers TypeScript, React and React Hooks rules.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.expo/**', '**/coverage/**', 'apps/app/expo-env.d.ts'],
  },
  {
    settings: {
      // Resolve the app's "@/..." alias and workspace packages through each tsconfig.
      'import/resolver': {
        typescript: { project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json'] },
      },
    },
  },
]);
