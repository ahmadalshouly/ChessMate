import { asc, count, eq } from 'drizzle-orm';
import type { Database } from '../client';
import { lessonChapters, lessons, type LessonChapterRow, type LessonRow } from '../schema';

/** Every chapter and lesson (drafts too), in order. */
export async function listLessonContent(db: Database): Promise<{ chapters: LessonChapterRow[]; lessons: LessonRow[] }> {
  const [chapters, rows] = await Promise.all([
    db.select().from(lessonChapters).orderBy(asc(lessonChapters.position), asc(lessonChapters.id)),
    db.select().from(lessons).orderBy(asc(lessons.position), asc(lessons.id)),
  ]);
  return { chapters, lessons: rows };
}

export async function countLessonChapters(db: Database): Promise<number> {
  const [row] = await db.select({ n: count() }).from(lessonChapters);
  return row?.n ?? 0;
}

export async function upsertLessonChapter(db: Database, c: { id: string; title: string; blurb: string; position: number }): Promise<void> {
  const now = new Date();
  await db
    .insert(lessonChapters)
    .values({ ...c, updatedAt: now })
    .onConflictDoUpdate({ target: lessonChapters.id, set: { title: c.title, blurb: c.blurb, position: c.position, updatedAt: now } });
}

/** False when the chapter still has lessons (move or delete them first). */
export async function deleteLessonChapter(db: Database, id: string): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(lessons).where(eq(lessons.chapterId, id));
  if ((row?.n ?? 0) > 0) return false;
  await db.delete(lessonChapters).where(eq(lessonChapters.id, id));
  return true;
}

export async function upsertLesson(
  db: Database,
  l: { id: string; chapterId: string; position: number; published: boolean; data: Record<string, unknown>; updatedBy: string | null },
): Promise<void> {
  const now = new Date();
  await db
    .insert(lessons)
    .values({ ...l, updatedAt: now })
    .onConflictDoUpdate({
      target: lessons.id,
      set: { chapterId: l.chapterId, position: l.position, published: l.published, data: l.data, updatedBy: l.updatedBy, updatedAt: now },
    });
}

export async function deleteLesson(db: Database, id: string): Promise<boolean> {
  const rows = await db.delete(lessons).where(eq(lessons.id, id)).returning({ id: lessons.id });
  return rows.length > 0;
}
