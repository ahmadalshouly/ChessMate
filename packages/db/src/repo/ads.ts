import { desc, eq, sql } from 'drizzle-orm';

import type { Database } from '../client';
import { adPlacements, adSpots, type AdPlacementRow, type AdSpotRow } from '../schema';

// ---------------------------------------------------------------- spots

export async function listAdSpots(db: Database): Promise<AdSpotRow[]> {
  return db.select().from(adSpots);
}

/** Switches a spot on or off, or saves its note. One row per spot. */
export async function upsertAdSpot(db: Database, row: typeof adSpots.$inferInsert): Promise<AdSpotRow> {
  const [out] = await db
    .insert(adSpots)
    .values(row)
    .onConflictDoUpdate({ target: adSpots.spot, set: { enabled: row.enabled, note: row.note ?? null, updatedBy: row.updatedBy ?? null, updatedAt: row.updatedAt ?? new Date() } })
    .returning();
  return out!;
}

// ---------------------------------------------------------------- placements

export async function insertAdPlacement(db: Database, p: typeof adPlacements.$inferInsert): Promise<AdPlacementRow> {
  const [row] = await db.insert(adPlacements).values(p).returning();
  return row!;
}

export async function listAdPlacements(db: Database, limit = 300): Promise<AdPlacementRow[]> {
  return db.select().from(adPlacements).orderBy(desc(adPlacements.createdAt)).limit(limit);
}

export async function adPlacement(db: Database, id: string): Promise<AdPlacementRow | null> {
  const [row] = await db.select().from(adPlacements).where(eq(adPlacements.id, id)).limit(1);
  return row ?? null;
}

export async function updateAdPlacement(db: Database, id: string, patch: Partial<typeof adPlacements.$inferInsert>): Promise<AdPlacementRow | null> {
  const [row] = await db.update(adPlacements).set(patch).where(eq(adPlacements.id, id)).returning();
  return row ?? null;
}

export async function deleteAdPlacement(db: Database, id: string): Promise<void> {
  await db.delete(adPlacements).where(eq(adPlacements.id, id));
}

/**
 * Counts a view or a tap. Done with one UPDATE rather than a read and a write,
 * so parallel requests cannot lose a count.
 */
export async function countAdEvent(db: Database, id: string, kind: 'impression' | 'click'): Promise<void> {
  const col = kind === 'click' ? adPlacements.clicks : adPlacements.impressions;
  await db
    .update(adPlacements)
    .set({ [kind === 'click' ? 'clicks' : 'impressions']: sql`${col} + 1` })
    .where(eq(adPlacements.id, id));
}
