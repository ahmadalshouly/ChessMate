import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { fairPlayRecords, titleApplications, titleDocuments, users, type TitleApplicationRow } from '../schema';

export type TitleDocumentMeta = { id: string; applicationId: string; name: string; mime: string; size: number };
export type TitleApplicationWithDocs = TitleApplicationRow & { username: string; documents: TitleDocumentMeta[] };

/** userId → role tag for every tagged account; loaded once at boot. */
export async function listRoleTaggedUsers(db: Database): Promise<{ id: string; roleTag: string }[]> {
  const rows = await db.select({ id: users.id, roleTag: users.roleTag }).from(users).where(isNotNull(users.roleTag));
  return rows.map((r) => ({ id: r.id, roleTag: r.roleTag! }));
}

export async function setUserRoleTag(db: Database, userId: string, roleTag: string | null, at = new Date()): Promise<void> {
  await db.update(users).set({ roleTag, updatedAt: at }).where(eq(users.id, userId));
}

/** userId → title for every titled account; loaded once at boot. */
export async function listTitledUsers(db: Database): Promise<{ id: string; title: string }[]> {
  const rows = await db.select({ id: users.id, title: users.title }).from(users).where(isNotNull(users.title));
  return rows.map((r) => ({ id: r.id, title: r.title! }));
}

export async function setUserTitle(db: Database, userId: string, title: string | null, at = new Date()): Promise<void> {
  await db
    .update(users)
    .set({ title, titleGrantedAt: title ? at : null, updatedAt: at })
    .where(eq(users.id, userId));
}

export async function insertTitleApplication(
  db: Database,
  a: { userId: string; title: string; fullName: string; fideId: string | null; federation: string | null; note: string | null; documents: { name: string; mime: string; data: Buffer }[] },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(titleApplications)
      .values({ userId: a.userId, title: a.title, fullName: a.fullName, fideId: a.fideId, federation: a.federation, note: a.note })
      .returning({ id: titleApplications.id });
    const appId = row!.id;
    if (a.documents.length) {
      await tx.insert(titleDocuments).values(a.documents.map((d) => ({ applicationId: appId, name: d.name, mime: d.mime, size: d.data.length, data: d.data })));
    }
    return appId;
  });
}

async function withDocs(db: Database, rows: (TitleApplicationRow & { username: string })[]): Promise<TitleApplicationWithDocs[]> {
  if (rows.length === 0) return [];
  const docs = await db
    .select({ id: titleDocuments.id, applicationId: titleDocuments.applicationId, name: titleDocuments.name, mime: titleDocuments.mime, size: titleDocuments.size })
    .from(titleDocuments)
    .where(
      inArray(
        titleDocuments.applicationId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(titleDocuments.createdAt));
  return rows.map((r) => ({ ...r, documents: docs.filter((d) => d.applicationId === r.id) }));
}

const appColumns = { app: titleApplications, username: users.username };

export async function listTitleApplications(db: Database, f: { status?: string; userId?: string; limit?: number } = {}): Promise<TitleApplicationWithDocs[]> {
  const where = and(f.status ? eq(titleApplications.status, f.status) : undefined, f.userId ? eq(titleApplications.userId, f.userId) : undefined);
  const rows = await db
    .select(appColumns)
    .from(titleApplications)
    .innerJoin(users, eq(users.id, titleApplications.userId))
    .where(where)
    // Pending queue: oldest first, so nobody waits forever. Everything else: newest first.
    .orderBy(f.status === 'pending' ? asc(titleApplications.createdAt) : desc(titleApplications.createdAt))
    .limit(f.limit ?? 100);
  return withDocs(
    db,
    rows.map((r) => ({ ...r.app, username: r.username })),
  );
}

export async function getTitleApplication(db: Database, id: string): Promise<TitleApplicationWithDocs | null> {
  const [r] = await db.select(appColumns).from(titleApplications).innerJoin(users, eq(users.id, titleApplications.userId)).where(eq(titleApplications.id, id));
  if (!r) return null;
  return (await withDocs(db, [{ ...r.app, username: r.username }]))[0]!;
}

export async function reviewTitleApplication(
  db: Database,
  id: string,
  r: { status: 'approved' | 'rejected' | 'withdrawn'; by?: string | null; byName?: string | null; note?: string | null; at?: Date },
): Promise<boolean> {
  const rows = await db
    .update(titleApplications)
    .set({ status: r.status, reviewedBy: r.by ?? null, reviewedByName: r.byName ?? null, reviewNote: r.note ?? null, reviewedAt: r.at ?? new Date() })
    .where(and(eq(titleApplications.id, id), eq(titleApplications.status, 'pending')))
    .returning({ id: titleApplications.id });
  return rows.length > 0;
}

export async function getTitleDocument(db: Database, id: string): Promise<(TitleDocumentMeta & { data: Buffer }) | null> {
  const [d] = await db.select().from(titleDocuments).where(eq(titleDocuments.id, id));
  return d ? { id: d.id, applicationId: d.applicationId, name: d.name, mime: d.mime, size: d.size, data: d.data } : null;
}

export async function countPendingTitleApplications(db: Database): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(titleApplications).where(eq(titleApplications.status, 'pending'));
  return Number(r?.n ?? 0);
}

// ---------------------------------------------------------------- fair-play records

export async function loadFairPlayRecords(db: Database): Promise<{ kind: string; key: string; data: Record<string, unknown> }[]> {
  return db.select({ kind: fairPlayRecords.kind, key: fairPlayRecords.key, data: fairPlayRecords.data }).from(fairPlayRecords).orderBy(asc(fairPlayRecords.createdAt));
}

export async function saveFairPlayRecord(db: Database, r: { kind: string; key: string; playerId?: string | null; data: Record<string, unknown> }): Promise<void> {
  await db
    .insert(fairPlayRecords)
    .values({ kind: r.kind, key: r.key, playerId: r.playerId ?? null, data: r.data })
    .onConflictDoUpdate({ target: [fairPlayRecords.kind, fairPlayRecords.key], set: { data: r.data } });
}

export async function deleteFairPlayRecord(db: Database, kind: string, key: string): Promise<void> {
  await db.delete(fairPlayRecords).where(and(eq(fairPlayRecords.kind, kind), eq(fairPlayRecords.key, key)));
}
