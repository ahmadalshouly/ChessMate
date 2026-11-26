import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCollectionItem,
  collectionsHoldingLink,
  createCollection,
  createUser,
  deleteUser,
  getCollection,
  getCollectionItems,
  listCollections,
  openDb,
  removeCollectionItem,
  updateCollection,
  type DbHandle,
} from '../src';

let h: DbHandle;
beforeAll(async () => {
  h = openDb({ url: process.env.TEST_DATABASE_URL ?? '', path: 'memory://' });
  await h.migrate();
});
afterAll(() => h.close());

const item = (key: string) => ({ title: 'A vs B', linkPath: `/game/${key}`, linkQuery: null, linkKey: `/game/${key}`, pgn: '1. e4 e5 *' });

describe('game collections', () => {
  it('keeps a game once per collection, counts games and lists public ones', async () => {
    const u = await createUser(h.db, { username: 'collector' });
    const mine = await createCollection(h.db, { userId: u.id, name: 'Best wins', description: null, isPublic: false });
    const shown = await createCollection(h.db, { userId: u.id, name: 'Endgames', description: 'Study', isPublic: true });

    expect((await addCollectionItem(h.db, mine.id, item('g1'))).added).toBe(true);
    expect((await addCollectionItem(h.db, mine.id, item('g1'))).added).toBe(false);
    await addCollectionItem(h.db, mine.id, item('g2'));
    await addCollectionItem(h.db, shown.id, item('g1'));

    const all = await listCollections(h.db, u.id);
    expect(all.map((c) => [c.name, c.games]).sort()).toEqual([
      ['Best wins', 2],
      ['Endgames', 1],
    ]);
    expect((await listCollections(h.db, u.id, { publicOnly: true })).map((c) => c.name)).toEqual(['Endgames']);
    expect((await collectionsHoldingLink(h.db, u.id, '/game/g1')).sort()).toEqual([mine.id, shown.id].sort());

    expect(await removeCollectionItem(h.db, mine.id, { linkKey: '/game/g1' })).toBe(true);
    expect((await getCollectionItems(h.db, mine.id)).map((i) => i.linkKey)).toEqual(['/game/g2']);

    expect((await updateCollection(h.db, mine.id, { isPublic: true }))?.isPublic).toBe(true);

    // Deleting the account takes its collections and their games with it.
    await deleteUser(h.db, u.id);
    expect(await getCollection(h.db, mine.id)).toBeUndefined();
    expect(await getCollectionItems(h.db, shown.id)).toEqual([]);
  });
});
