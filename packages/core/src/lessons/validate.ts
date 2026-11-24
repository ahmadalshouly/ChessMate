import { Chess } from 'chess.js';

import { PUZZLE_THEME_LABELS, isValidPuzzle, type PuzzleDto } from '../puzzle';
import type { Square } from '../types';
import type { Lesson, LessonArrow, LessonChapter, LessonExplainStep, LessonLevel, LessonPuzzleStep, ReadMoreLink } from './lessons';

/*
 * Lessons edited in the staff console. The server stores them and serves the
 * published ones to the app; these checks run on the server before anything is
 * saved, so the app can trust every lesson it receives.
 */

/** What the app downloads: published chapters and lessons, in order. */
export interface LessonCatalog {
  /** Changes whenever the content changes; the app keeps the last catalog it saw. */
  version: string;
  chapters: LessonChapter[];
}

/** A lesson as the console sees it, with its place and status. */
export interface AdminLesson extends Lesson {
  chapterId: string;
  position: number;
  published: boolean;
  updatedAt: number;
  updatedBy: string | null;
}

export interface AdminLessonChapter {
  id: string;
  title: string;
  blurb: string;
  position: number;
  lessons: AdminLesson[];
}

/** A puzzle step as the console sends it: the puzzle by id, looked up on the server. */
export interface LessonPuzzleStepInput {
  kind: 'puzzle';
  prompt: string;
  puzzleId: string;
}

export type LessonStepInput = LessonExplainStep | LessonPuzzleStepInput;

export interface LessonInput {
  id: string;
  chapterId: string;
  title: string;
  summary: string;
  level: LessonLevel;
  icon: string;
  practiceTheme: string;
  readMore: ReadMoreLink[];
  steps: LessonStepInput[];
  published: boolean;
}

export interface LessonChapterInput {
  id: string;
  title: string;
  blurb: string;
}

export const LESSON_LIMITS = {
  title: 80,
  summary: 200,
  chapterBlurb: 300,
  stepTitle: 80,
  body: 1200,
  prompt: 120,
  steps: 24,
  arrows: 12,
  highlights: 64,
  readMore: 5,
  linkTitle: 80,
} as const;

export class LessonInputError extends Error {}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,47}$/;
const ICON_RE = /^[a-z0-9-]{1,40}$/;
const SQUARE_RE = /^[a-h][1-8]$/;
const LEVELS: readonly LessonLevel[] = ['beginner', 'intermediate'];
const TONES: readonly NonNullable<LessonArrow['tone']>[] = ['move', 'attack', 'defend'];

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);

function str(v: unknown, field: string, max: number, opts: { required?: boolean } = {}): string {
  const s = typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '';
  if (opts.required !== false && !s) throw new LessonInputError(`${field} is required`);
  if (s.length > max) throw new LessonInputError(`${field} is too long (at most ${max} characters)`);
  return s;
}

export function isLessonId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

function id(v: unknown, field: string): string {
  if (!isLessonId(v)) throw new LessonInputError(`${field} must be 2 to 48 letters, digits, - or _`);
  return v;
}

function square(v: unknown, where: string): Square {
  if (typeof v !== 'string' || !SQUARE_RE.test(v)) throw new LessonInputError(`${where}: "${String(v)}" is not a square`);
  return v as Square;
}

/** Throws unless the FEN is a legal position. Returns it normalised. */
export function checkLessonFen(fen: unknown, where: string): string {
  if (typeof fen !== 'string' || !fen.trim()) throw new LessonInputError(`${where}: position (FEN) is required`);
  try {
    return new Chess(fen.trim()).fen();
  } catch (e) {
    throw new LessonInputError(`${where}: the position is not legal (${e instanceof Error ? e.message : 'bad FEN'})`);
  }
}

function explainStep(raw: Raw, where: string): LessonExplainStep {
  const fen = checkLessonFen(raw.fen, where);
  const orientation = raw.orientation === 'w' || raw.orientation === 'b' ? raw.orientation : undefined;
  const arrowsRaw = raw.arrows === undefined ? [] : raw.arrows;
  if (!Array.isArray(arrowsRaw) || arrowsRaw.length > LESSON_LIMITS.arrows) throw new LessonInputError(`${where}: at most ${LESSON_LIMITS.arrows} arrows`);
  const arrows: LessonArrow[] = arrowsRaw.map((a, i) => {
    if (!isObj(a)) throw new LessonInputError(`${where}: arrow ${i + 1} is not valid`);
    const from = square(a.from, `${where}, arrow ${i + 1}`);
    const to = square(a.to, `${where}, arrow ${i + 1}`);
    if (from === to) throw new LessonInputError(`${where}: arrow ${i + 1} starts and ends on ${from}`);
    const tone = a.tone === undefined ? 'move' : a.tone;
    if (!TONES.includes(tone as LessonArrow['tone'] & string)) throw new LessonInputError(`${where}: arrow ${i + 1} has an unknown colour`);
    return { from, to, tone: tone as LessonArrow['tone'] };
  });
  const hlRaw = raw.highlights === undefined ? [] : raw.highlights;
  if (!Array.isArray(hlRaw) || hlRaw.length > LESSON_LIMITS.highlights) throw new LessonInputError(`${where}: at most ${LESSON_LIMITS.highlights} marked squares`);
  const highlights = [...new Set(hlRaw.map((s) => square(s, `${where}, marked square`)))];
  return {
    kind: 'explain',
    title: str(raw.title, `${where}: title`, LESSON_LIMITS.stepTitle),
    body: str(raw.body, `${where}: text`, LESSON_LIMITS.body),
    fen,
    ...(orientation ? { orientation } : {}),
    ...(arrows.length ? { arrows } : {}),
    ...(highlights.length ? { highlights } : {}),
  };
}

function puzzleStep(raw: Raw, where: string): LessonPuzzleStepInput {
  const puzzleId = typeof raw.puzzleId === 'string' ? raw.puzzleId.trim() : isObj(raw.puzzle) && typeof raw.puzzle.id === 'string' ? raw.puzzle.id : '';
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(puzzleId)) throw new LessonInputError(`${where}: puzzle id is required`);
  return { kind: 'puzzle', prompt: str(raw.prompt, `${where}: instruction`, LESSON_LIMITS.prompt), puzzleId };
}

/** Checks and tidies a lesson sent by the console. Puzzles are looked up afterwards (see resolveLessonPuzzles). */
export function cleanLessonInput(raw: unknown): LessonInput {
  if (!isObj(raw)) throw new LessonInputError('Send the lesson as an object');
  const level = raw.level ?? 'beginner';
  if (!LEVELS.includes(level as LessonLevel)) throw new LessonInputError('Level must be beginner or intermediate');
  const icon = typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon.trim() : 'book-outline';
  if (!ICON_RE.test(icon)) throw new LessonInputError('Icon must be an icon name such as "book-outline"');
  const practiceTheme = typeof raw.practiceTheme === 'string' ? raw.practiceTheme.trim() : '';
  if (practiceTheme && !PUZZLE_THEME_LABELS[practiceTheme]) throw new LessonInputError(`Unknown puzzle theme "${practiceTheme}"`);

  const linksRaw = raw.readMore === undefined ? [] : raw.readMore;
  if (!Array.isArray(linksRaw) || linksRaw.length > LESSON_LIMITS.readMore) throw new LessonInputError(`At most ${LESSON_LIMITS.readMore} read-more links`);
  const readMore = linksRaw.map((l, i) => {
    if (!isObj(l)) throw new LessonInputError(`Read-more link ${i + 1} is not valid`);
    const url = str(l.url, `Read-more link ${i + 1}: address`, 400);
    if (!/^https:\/\/[^\s]+$/.test(url)) throw new LessonInputError(`Read-more link ${i + 1} must start with https://`);
    return { title: str(l.title, `Read-more link ${i + 1}: title`, LESSON_LIMITS.linkTitle), url };
  });

  const stepsRaw = raw.steps;
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) throw new LessonInputError('A lesson needs at least one step');
  if (stepsRaw.length > LESSON_LIMITS.steps) throw new LessonInputError(`At most ${LESSON_LIMITS.steps} steps`);
  const steps = stepsRaw.map((s, i): LessonStepInput => {
    const where = `Step ${i + 1}`;
    if (!isObj(s)) throw new LessonInputError(`${where} is not valid`);
    if (s.kind === 'explain') return explainStep(s, where);
    if (s.kind === 'puzzle') return puzzleStep(s, where);
    throw new LessonInputError(`${where}: kind must be "explain" or "puzzle"`);
  });

  return {
    id: id(raw.id, 'Lesson id'),
    chapterId: id(raw.chapterId, 'Chapter'),
    title: str(raw.title, 'Title', LESSON_LIMITS.title),
    summary: str(raw.summary, 'Summary', LESSON_LIMITS.summary),
    level: level as LessonLevel,
    icon,
    practiceTheme,
    readMore,
    steps,
    published: raw.published !== false,
  };
}

export function cleanChapterInput(raw: unknown): LessonChapterInput {
  if (!isObj(raw)) throw new LessonInputError('Send the chapter as an object');
  return {
    id: id(raw.id, 'Chapter id'),
    title: str(raw.title, 'Chapter title', LESSON_LIMITS.title),
    blurb: str(raw.blurb, 'Chapter description', LESSON_LIMITS.chapterBlurb, { required: false }),
  };
}

/**
 * Swaps puzzle ids for the puzzles themselves. `find` looks a puzzle up (the
 * puzzle database, then the lesson's previous version); unknown or broken
 * puzzles are refused.
 */
export function resolveLessonPuzzles(input: LessonInput, find: (id: string) => PuzzleDto | undefined): Lesson {
  const steps = input.steps.map((s, i): Lesson['steps'][number] => {
    if (s.kind === 'explain') return s;
    const puzzle = find(s.puzzleId);
    if (!puzzle) throw new LessonInputError(`Step ${i + 1}: no puzzle with id "${s.puzzleId}"`);
    if (!isValidPuzzle(puzzle)) throw new LessonInputError(`Step ${i + 1}: puzzle ${s.puzzleId} is not valid`);
    const { id: pid, fen, moves, rating, themes, plays } = puzzle;
    return { kind: 'puzzle', prompt: s.prompt, puzzle: { id: pid, fen, moves, rating, themes, plays } } satisfies LessonPuzzleStep;
  });
  const { id: lessonId, title, summary, level, icon, practiceTheme, readMore } = input;
  return { id: lessonId, title, summary, level, icon, practiceTheme, readMore, steps };
}
