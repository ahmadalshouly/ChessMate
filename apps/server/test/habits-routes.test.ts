import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DevProfileBackend, MemoryProfileStore, profileRoutes } from '../src/profiles';
import { ChessServer } from '../src/server';

// Regression: the profile routes claim /api/me/*, so the play-limits endpoints must
// still answer when those routes run first, as they do in production.
let server: ChessServer;
let base: string;

beforeAll(async () => {
  server = new ChessServer({ port: 0, http: [profileRoutes(new DevProfileBackend(), new MemoryProfileStore())] });
  base = `http://localhost:${await server.listen()}`;
});
afterAll(() => server.close());

const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: 'Bearer dev:u_limits:Limits', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as { habits?: { limits: { enabled: boolean; maxGames: number } } } };
};

describe('play limits API through the full server', () => {
  it('loads and saves the settings', async () => {
    const loaded = await call('GET', '/api/habits?tz=60');
    expect(loaded.status).toBe(200);
    expect(loaded.data.habits?.limits.enabled).toBe(false);

    const saved = await call('POST', '/api/habits', { enabled: true, maxGames: 3 });
    expect(saved.status).toBe(200);
    expect(saved.data.habits?.limits).toMatchObject({ enabled: true, maxGames: 3 });

    expect((await call('GET', '/api/habits')).data.habits?.limits.maxGames).toBe(3);
  });
});
