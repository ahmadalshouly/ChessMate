import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DevProfileBackend, MemoryProfileStore, profileRoutes } from '../src/profiles';
import { ChessServer } from '../src/server';

let server: ChessServer;
let base: string;

beforeAll(async () => {
  server = new ChessServer({ port: 0, http: [profileRoutes(new DevProfileBackend(), new MemoryProfileStore())] });
  base = `http://localhost:${await server.listen()}`;
});
afterAll(() => server.close());

type Body = Record<string, any>;

const as =
  (user: string | null) =>
  async (method: string, path: string, body?: unknown): Promise<{ status: number; data: Body }> => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(user ? { authorization: `Bearer dev:${user}:${user}` } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: ((await res.json().catch(() => null)) ?? {}) as Body };
  };
const alice = as('u_alice');
const bob = as('u_bob');
const guest = as(null);

const game = { title: 'Alice vs Bob', link: { path: '/game/abc123' }, pgn: '[Event "Casual"]\n\n1. e4 e5 *' };
const line = { title: 'Analysis board', link: { path: '/analysis', query: { moves: 'e2e4,e7e5', ply: '1' } }, pgn: null };

describe('game collections API', () => {
  it('creates collections, adds games once, and shows only public ones to others', async () => {
    expect((await guest('POST', '/api/collections', { name: 'x' })).status).toBe(401);
    expect((await alice('POST', '/api/collections', { name: '   ' })).status).toBe(400);

    const created = await alice('POST', '/api/collections', { name: 'Best wins', item: game });
    expect(created.status).toBe(201);
    const best = created.data.collection;
    expect(best).toMatchObject({ name: 'Best wins', isPublic: false, games: 1, isMine: true });

    const study = (await alice('POST', '/api/collections', { name: 'Study', description: 'Endgames', isPublic: true })).data.collection;

    // The same game twice stays one game; the query order does not matter.
    expect((await alice('POST', `/api/collections/${study.id}/items`, line)).status).toBe(201);
    const again = await alice('POST', `/api/collections/${study.id}/items`, { ...line, link: { path: '/analysis', query: { ply: '1', moves: 'e2e4,e7e5' } } });
    expect(again.status).toBe(200);
    expect(again.data.added).toBe(false);

    // Which of my collections hold this game (for the checkmarks in the Share sheet).
    const marked = await alice('GET', `/api/collections?link=${encodeURIComponent('/game/abc123')}`);
    expect(Object.fromEntries(marked.data.collections.map((c: Body) => [c.name, c.has]))).toEqual({ 'Best wins': true, Study: false });

    // Others see only the collection on the profile.
    const shown = await bob('GET', '/api/collections?user=u_alice');
    expect(shown.data.collections.map((c: Body) => c.name)).toEqual(['Study']);
    expect((await guest('GET', `/api/collections/${study.id}`)).data.collection.items).toHaveLength(1);
    expect((await bob('GET', `/api/collections/${best.id}`)).status).toBe(404);

    // Only the owner changes a collection.
    expect((await bob('POST', `/api/collections/${study.id}/items`, game)).status).toBe(404);
    expect((await bob('PATCH', `/api/collections/${study.id}`, { name: 'Mine now' })).status).toBe(404);

    // Hide it again: gone from the profile.
    expect((await alice('PATCH', `/api/collections/${study.id}`, { isPublic: false })).data.collection.isPublic).toBe(false);
    expect((await bob('GET', '/api/collections?user=u_alice')).data.collections).toEqual([]);

    // Remove by link (from the Share sheet) and by item id (from the collection page).
    expect((await alice('DELETE', `/api/collections/${best.id}/items`, { link: game.link })).status).toBe(200);
    const itemId = (await alice('GET', `/api/collections/${study.id}`)).data.collection.items[0].id;
    expect((await alice('DELETE', `/api/collections/${study.id}/items/${itemId}`)).status).toBe(200);
    expect((await alice('GET', `/api/collections/${study.id}`)).data.collection.games).toBe(0);

    expect((await alice('DELETE', `/api/collections/${best.id}`)).status).toBe(200);
    expect((await alice('GET', '/api/collections')).data.collections.map((c: Body) => c.name)).toEqual(['Study']);
  });

  it('refuses links the Share button never builds', async () => {
    const c = (await alice('POST', '/api/collections', { name: 'Links' })).data.collection;
    expect((await alice('POST', `/api/collections/${c.id}/items`, { title: 'x', link: { path: 'https://evil.example' } })).status).toBe(400);
    expect((await alice('POST', `/api/collections/${c.id}/items`, { title: 'x', link: { path: '/settings' } })).status).toBe(400);
    expect((await alice('POST', `/api/collections/${c.id}/items`, { title: 'x', link: { path: '/analysis', query: { next: '/admin' } } })).status).toBe(400);
  });
});
