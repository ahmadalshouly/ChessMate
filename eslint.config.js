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
    rules: {
      // React Compiler advisories from react-hooks v6: shown as warnings so they can be
      // cleaned up gradually without blocking CI. They flag style, not broken behaviour.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/use-memo': 'warn',
      // React Native <Text> renders apostrophes and quotes literally; escaping is an HTML concern.
      'react/no-unescaped-entities': 'off',
      // TypeScript already checks namespace members (and follows `export *` re-exports this rule misses).
      'import/namespace': 'off',
    },
  },
]);
