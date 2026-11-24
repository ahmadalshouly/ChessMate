import { createHash } from 'node:crypto';

import {
  LESSON_CHAPTERS,
  LessonInputError,
  cleanChapterInput,
  cleanLessonInput,
  resolveLessonPuzzles,
  type AdminLesson,
  type AdminLessonChapter,
  type Lesson,
  type LessonCatalog,
  type LessonChapter,
  type Puzzle,
  type PuzzleDto,
} from '@chessmate/core';
import {
  countLessonChapters,
  deleteLesson,
  deleteLessonChapter,
  listLessonContent,
  upsertLesson,
  upsertLessonChapter,
  type Database,
} from '@chessmate/db';

export class LessonError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** What lessons need from the puzzle database. */
export interface LessonPuzzleSource {
  get(id: string): Puzzle | undefined;
  pick(q: { rating: number; theme?: string; exclude?: Set<string>; window?: number }): Puzzle | undefined;
}

export interface LessonServiceOptions {
  db: Database;
  puzzles?: LessonPuzzleSource;
}

/** The lessons that ship with the app, as a catalog (used without a database). */
export function builtinLessonCatalog(): LessonCatalog {
  return withVersion(LESSON_CHAPTERS.map((c) => ({ ...c, lessons: [...c.lessons] })));
}

function withVersion(chapters: LessonChapter[]): LessonCatalog {
  const version = createHash('sha1').update(JSON.stringify(chapters)).digest('hex').slice(0, 16);
  return { version, chapters };
}

/**
 * Learn-tab lessons kept in the database, so staff can add and change them
 * from the console without an app release. On first start the table is filled
 * with the lessons that ship with the app. Everything is held in memory and
 * reloaded after each change; there are only ever a few dozen lessons.
 */
export class LessonService {
  private content: AdminLessonChapter[] = [];
  private published: LessonCatalog = builtinLessonCatalog();

  constructor(private readonly opts: LessonServiceOptions) {}

  async load(): Promise<void> {
    if ((await countLessonChapters(this.opts.db)) === 0) await this.seed();
    await this.refresh();
  }

  /** Fills an empty database with the built-in lessons. */
  private async seed() {
    for (const [ci, chapter] of LESSON_CHAPTERS.entries()) {
      await upsertLessonChapter(this.opts.db, { id: chapter.id, title: chapter.title, blurb: chapter.blurb, position: ci });
      for (const [li, lesson] of chapter.lessons.entries()) {
        await upsertLesson(this.opts.db, { id: lesson.id, chapterId: chapter.id, position: li, published: true, data: lesson as unknown as Record<string, unknown>, updatedBy: null });
      }
    }
  }

  private async refresh() {
    const { chapters, lessons } = await listLessonContent(this.opts.db);
    this.content = chapters.map((c) => ({
      id: c.id,
      title: c.title,
      blurb: c.blurb,
      position: c.position,
      lessons: lessons
        .filter((l) => l.chapterId === c.id)
        .map((l) => ({
          ...(l.data as unknown as Lesson),
          id: l.id,
          chapterId: l.chapterId,
          position: l.position,
          published: l.published,
          updatedAt: l.updatedAt.getTime(),
          updatedBy: l.updatedBy,
        })),
    }));
    this.published = withVersion(
      this.content
        .map((c) => ({ id: c.id, title: c.title, blurb: c.blurb, lessons: c.lessons.filter((l) => l.published).map(publicLesson) }))
        .filter((c) => c.lessons.length > 0),
    );
  }

  /** Published lessons for the app. */
  catalog(): LessonCatalog {
    return this.published;
  }

  /** Everything, drafts included, for the console. */
  all(): AdminLessonChapter[] {
    return this.content;
  }

  private lesson(id: string): AdminLesson | undefined {
    for (const c of this.content) for (const l of c.lessons) if (l.id === id) return l;
    return undefined;
  }

  async saveLesson(raw: unknown, actor: string, opts: { create?: boolean } = {}): Promise<AdminLesson> {
    const input = call(() => cleanLessonInput(raw));
    const chapter = this.content.find((c) => c.id === input.chapterId);
    if (!chapter) throw new LessonError(400, `No chapter "${input.chapterId}"`);
    const before = this.lesson(input.id);
    if (opts.create && before) throw new LessonError(409, `A lesson with id "${input.id}" already exists`);
    // Puzzles come from the puzzle database; one already in the lesson is kept even if the database is still loading.
    const kept = new Map<string, PuzzleDto>();
    for (const s of before?.steps ?? []) if (s.kind === 'puzzle') kept.set(s.puzzle.id, s.puzzle);
    const lesson = call(() => resolveLessonPuzzles(input, (id) => this.opts.puzzles?.get(id) ?? kept.get(id)));
    const position = before && before.chapterId === input.chapterId ? before.position : nextPosition(chapter.lessons);
    await upsertLesson(this.opts.db, { id: lesson.id, chapterId: input.chapterId, position, published: input.published, data: lesson as unknown as Record<string, unknown>, updatedBy: actor });
    await this.refresh();
    return this.lesson(lesson.id)!;
  }

  async removeLesson(id: string): Promise<AdminLesson> {
    const before = this.lesson(id);
    if (!before || !(await deleteLesson(this.opts.db, id))) throw new LessonError(404, 'No such lesson');
    await this.refresh();
    return before;
  }

  /** Moves a lesson one place up (-1) or down (+1) in its chapter. */
  async moveLesson(id: string, delta: number): Promise<void> {
    const chapter = this.content.find((c) => c.lessons.some((l) => l.id === id));
    if (!chapter) throw new LessonError(404, 'No such lesson');
    const order = reorder(chapter.lessons, id, delta);
    for (const [i, l] of order.entries()) {
      if (l.position === i) continue;
      const { chapterId, position: _p, published, updatedAt: _u, updatedBy, ...data } = l;
      await upsertLesson(this.opts.db, { id: l.id, chapterId, position: i, published, data: data as unknown as Record<string, unknown>, updatedBy });
    }
    await this.refresh();
  }

  async saveChapter(raw: unknown): Promise<AdminLessonChapter> {
    const input = call(() => cleanChapterInput(raw));
    const before = this.content.find((c) => c.id === input.id);
    await upsertLessonChapter(this.opts.db, { ...input, position: before ? before.position : nextPosition(this.content) });
    await this.refresh();
    return this.content.find((c) => c.id === input.id)!;
  }

  async removeChapter(id: string): Promise<AdminLessonChapter> {
    const before = this.content.find((c) => c.id === id);
    if (!before) throw new LessonError(404, 'No such chapter');
    if (!(await deleteLessonChapter(this.opts.db, id))) throw new LessonError(409, 'Move or delete the lessons in this chapter first');
    await this.refresh();
    return before;
  }

  async moveChapter(id: string, delta: number): Promise<void> {
    if (!this.content.some((c) => c.id === id)) throw new LessonError(404, 'No such chapter');
    for (const [i, c] of reorder(this.content, id, delta).entries()) {
      if (c.position !== i) await upsertLessonChapter(this.opts.db, { id: c.id, title: c.title, blurb: c.blurb, position: i });
    }
    await this.refresh();
  }

  /** A few puzzles on a theme near a rating, to pick from in the lesson editor. */
  suggestPuzzles(q: { theme?: string; rating?: number; count?: number }): PuzzleDto[] {
    const source = this.opts.puzzles;
    if (!source) return [];
    const exclude = new Set<string>();
    const out: PuzzleDto[] = [];
    const rating = Math.max(400, Math.min(3000, Math.round(q.rating ?? 1000)));
    for (let i = 0; i < Math.min(12, q.count ?? 6); i++) {
      const p = source.pick({ rating, theme: q.theme || undefined, exclude, window: 150 });
      if (!p) break;
      exclude.add(p.id);
      out.push({ id: p.id, fen: p.fen, moves: p.moves, rating: p.rating, themes: p.themes, plays: p.plays });
    }
    return out;
  }

  /** One puzzle by id, for the editor's preview. */
  puzzle(id: string): PuzzleDto | null {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) return null;
    const p = this.opts.puzzles?.get(id);
    return p ? { id: p.id, fen: p.fen, moves: p.moves, rating: p.rating, themes: p.themes, plays: p.plays } : null;
  }
}

function publicLesson(l: AdminLesson): Lesson {
  const { id, title, summary, level, icon, steps, practiceTheme, readMore } = l;
  return { id, title, summary, level, icon, steps, practiceTheme, readMore };
}

function nextPosition(list: { position: number }[]): number {
  return list.reduce((m, x) => Math.max(m, x.position + 1), 0);
}

function reorder<T extends { id: string }>(list: T[], id: string, delta: number): T[] {
  const out = [...list];
  const i = out.findIndex((x) => x.id === id);
  const j = Math.max(0, Math.min(out.length - 1, i + Math.sign(delta)));
  if (i < 0 || i === j) return out;
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

function call<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof LessonInputError) throw new LessonError(400, e.message);
    throw e;
  }
}
