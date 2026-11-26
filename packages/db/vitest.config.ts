import { defineConfig } from 'vitest/config';

// Each test migrates a fresh in-memory PGlite database from the first
// migration, which takes about 5 s on a CI runner and grows with every
// migration; the default 5 s timeout made these tests fail by a few hundred ms.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
