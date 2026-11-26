import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { gameCollectionItems, gameCollections, type GameCollectionItemRow, type GameCollectionRow } from '../schema';

export type CollectionWithCount = GameCollectionRow & { games: number };

/** A player's collections, most recently changed first, with how many games each holds. */
export async function listCollections(db: Database, userId: string, opts: { publicOnly?: boolean } = {}): Promise<CollectionWithCount[]> {
  const where = opts.publicOnly ? and(eq(gameCollections.userId, userId), eq(gameCollections.isPublic, true)) : eq(gameCollections.userId, userId);
  const rows = await db.select().from(gameCollections).where(where).orderBy(desc(gameCollections.updatedAt));
  if (rows.length === 0) return [];
  const counts = await db
    .select({ id: gameCollectionItems.collectionId, n: sql<number>`count(*)::int` })
    .from(gameCollectionItems)
    .where(
      inArray(
        gameCollectionItems.collectionId,
        rows.map((r) => r.id),
      ),
    )
    .groupBy(gameCollectionItems.collectionId);
  const by = new Map(counts.map((c) => [c.id, Number(c.n)]));
  return rows.map((r) => ({ ...r, games: by.get(r.id) ?? 0 }));
}

/** Ids of this player's collections that already hold the game with this link key. */
export async function collectionsHoldingLink(db: Database, userId: string, linkKey: string): Promise<string[]> {
  const rows = await db
    .select({ id: gameCollectionItems.collectionId })
    .from(gameCollectionItems)
    .innerJoin(gameCollections, eq(gameCollections.id, gameCollectionItems.collectionId))
    .where(and(eq(gameCollections.userId, userId), eq(gameCollectionItems.linkKey, linkKey)));
  return rows.map((r) => r.id);
}

export async function getCollection(db: Database, id: string): Promise<GameCollectionRow | undefined> {
  const [row] = await db.select().from(gameCollections).where(eq(gameCollections.id, id));
  return row;
}

/** Newest first. */
export async function getCollectionItems(db: Database, collectionId: string): Promise<GameCollectionItemRow[]> {
  return db.select().from(gameCollectionItems).where(eq(gameCollectionItems.collectionId, collectionId)).orderBy(desc(gameCollectionItems.addedAt));
}

export async function countCollectionItems(db: Database, collectionId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(gameCollectionItems).where(eq(gameCollectionItems.collectionId, collectionId));
  return Number(r?.n ?? 0);
}

export async function countCollections(db: Database, userId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(gameCollections).where(eq(gameCollections.userId, userId));
  return Number(r?.n ?? 0);
}

export async function createCollection(db: Database, input: { userId: string; name: string; description: string | null; isPublic: boolean }): Promise<GameCollectionRow> {
  const [row] = await db.insert(gameCollections).values(input).returning();
  return row!;
}

export async function updateCollection(db: Database, id: string, patch: Partial<Pick<GameCollectionRow, 'name' | 'description' | 'isPublic'>>): Promise<GameCollectionRow | undefined> {
  const [row] = await db
    .update(gameCollections)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(gameCollections.id, id))
    .returning();
  return row;
}

export async function deleteCollection(db: Database, id: string): Promise<void> {
  await db.delete(gameCollections).where(eq(gameCollections.id, id));
}

/** Adds a game; a game already in the collection (same link key) is left as it is and returned. */
export async function addCollectionItem(
  db: Database,
  collectionId: string,
  item: { title: string; linkPath: string; linkQuery: Record<string, string> | null; linkKey: string; pgn: string | null },
): Promise<{ item: GameCollectionItemRow; added: boolean }> {
  const [row] = await db
    .insert(gameCollectionItems)
    .values({ ...item, collectionId })
    .onConflictDoNothing({ target: [gameCollectionItems.collectionId, gameCollectionItems.linkKey] })
    .returning();
  if (row) {
    await db.update(gameCollections).set({ updatedAt: new Date() }).where(eq(gameCollections.id, collectionId));
    return { item: row, added: true };
  }
  const [existing] = await db
    .select()
    .from(gameCollectionItems)
    .where(and(eq(gameCollectionItems.collectionId, collectionId), eq(gameCollectionItems.linkKey, item.linkKey)));
  return { item: existing!, added: false };
}

/** Removes a game by its item id or its link key. True when something was removed. */
export async function removeCollectionItem(db: Database, collectionId: string, by: { id: string } | { linkKey: string }): Promise<boolean> {
  const match = 'id' in by ? eq(gameCollectionItems.id, by.id) : eq(gameCollectionItems.linkKey, by.linkKey);
  const rows = await db
    .delete(gameCollectionItems)
    .where(and(eq(gameCollectionItems.collectionId, collectionId), match))
    .returning({ id: gameCollectionItems.id });
  if (rows.length) await db.update(gameCollections).set({ updatedAt: new Date() }).where(eq(gameCollections.id, collectionId));
  return rows.length > 0;
}
