import type { AdminLesson, LessonArrow, LessonExplainStep, LessonInput, PuzzleDto, Square } from '@chessmate/core';

/**
 * Form state for the lesson editor in the staff console. Arrows and marked
 * squares are typed as short text ("e2e4 c6e5:attack", "e4 d5") and parsed
 * here; the server checks everything again before saving.
 */
export interface ExplainDraft {
  kind: 'explain';
  key: string;
  title: string;
  body: string;
  fen: string;
  orientation: 'auto' | 'w' | 'b';
  arrows: string;
  highlights: string;
}

export interface PuzzleDraft {
  kind: 'puzzle';
  key: string;
  prompt: string;
  puzzleId: string;
  /** The puzzle, once known, for the preview board. */
  puzzle: PuzzleDto | null;
}

export type StepDraft = ExplainDraft | PuzzleDraft;

export interface LessonDraft {
  id: string;
  chapterId: string;
  title: string;
  summary: string;
  level: 'beginner' | 'intermediate';
  icon: string;
  practiceTheme: string;
  published: boolean;
  readMore: { title: string; url: string }[];
  steps: StepDraft[];
}

let keySeq = 0;
export const stepKey = () => `s${++keySeq}`;

export const EMPTY_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

export function newExplainStep(fen = EMPTY_FEN): ExplainDraft {
  return { kind: 'explain', key: stepKey(), title: '', body: '', fen, orientation: 'auto', arrows: '', highlights: '' };
}

export function newPuzzleStep(): PuzzleDraft {
  return { kind: 'puzzle', key: stepKey(), prompt: '', puzzleId: '', puzzle: null };
}

export function emptyLesson(chapterId: string): LessonDraft {
  return { id: '', chapterId, title: '', summary: '', level: 'beginner', icon: 'book-outline', practiceTheme: '', published: false, readMore: [], steps: [newExplainStep()] };
}

export function formatArrows(arrows: LessonArrow[] | undefined): string {
  return (arrows ?? []).map((a) => `${a.from}${a.to}${a.tone && a.tone !== 'move' ? `:${a.tone}` : ''}`).join(' ');
}

const TONES = new Set(['move', 'attack', 'defend']);

/** "e2e4 c6e5:attack" → arrows, or the first word that is not an arrow. */
export function parseArrows(text: string): { arrows: LessonArrow[]; bad: string | null } {
  const arrows: LessonArrow[] = [];
  for (const word of text.split(/[\s,]+/).filter(Boolean)) {
    const m = /^([a-h][1-8])-?([a-h][1-8])(?::(\w+))?$/i.exec(word);
    if (!m || m[1]!.toLowerCase() === m[2]!.toLowerCase() || (m[3] && !TONES.has(m[3].toLowerCase()))) return { arrows, bad: word };
    arrows.push({ from: m[1]!.toLowerCase() as Square, to: m[2]!.toLowerCase() as Square, tone: (m[3]?.toLowerCase() ?? 'move') as LessonArrow['tone'] });
  }
  return { arrows, bad: null };
}

/** "e4 d5" → squares, or the first word that is not a square. */
export function parseSquares(text: string): { squares: Square[]; bad: string | null } {
  const squares: Square[] = [];
  for (const word of text.split(/[\s,]+/).filter(Boolean)) {
    if (!/^[a-h][1-8]$/i.test(word)) return { squares, bad: word };
    squares.push(word.toLowerCase() as Square);
  }
  return { squares, bad: null };
}

export function draftFromLesson(l: AdminLesson): LessonDraft {
  return {
    id: l.id,
    chapterId: l.chapterId,
    title: l.title,
    summary: l.summary,
    level: l.level,
    icon: l.icon,
    practiceTheme: l.practiceTheme,
    published: l.published,
    readMore: l.readMore.map((r) => ({ ...r })),
    steps: l.steps.map((s): StepDraft =>
      s.kind === 'explain'
        ? { kind: 'explain', key: stepKey(), title: s.title, body: s.body, fen: s.fen, orientation: s.orientation ?? 'auto', arrows: formatArrows(s.arrows), highlights: (s.highlights ?? []).join(' ') }
        : { kind: 'puzzle', key: stepKey(), prompt: s.prompt, puzzleId: s.puzzle.id, puzzle: s.puzzle },
    ),
  };
}

/** The explanation step as the app will show it (bad arrows and squares left out). */
export function previewStep(s: ExplainDraft): LessonExplainStep {
  return {
    kind: 'explain',
    title: s.title,
    body: s.body,
    fen: s.fen,
    ...(s.orientation !== 'auto' ? { orientation: s.orientation } : {}),
    arrows: parseArrows(s.arrows).arrows,
    highlights: parseSquares(s.highlights).squares,
  };
}

/** What the console sends to the server. */
export function lessonInputFrom(d: LessonDraft): LessonInput {
  return {
    id: d.id.trim(),
    chapterId: d.chapterId,
    title: d.title,
    summary: d.summary,
    level: d.level,
    icon: d.icon.trim(),
    practiceTheme: d.practiceTheme.trim(),
    published: d.published,
    readMore: d.readMore.filter((r) => r.title.trim() || r.url.trim()),
    steps: d.steps.map((s) => (s.kind === 'explain' ? previewStep(s) : { kind: 'puzzle', prompt: s.prompt, puzzleId: s.puzzleId.trim() })),
  };
}

/** Problems the editor can point at before saving: step index → message. */
export function draftProblems(d: LessonDraft): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of d.steps) {
    if (s.kind !== 'explain') continue;
    const a = parseArrows(s.arrows);
    if (a.bad) out.set(s.key, `arrows: "${a.bad}"`);
    const h = parseSquares(s.highlights);
    if (h.bad) out.set(s.key, `squares: "${h.bad}"`);
  }
  return out;
}

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const j = index + delta;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[index], out[j]] = [out[j]!, out[index]!];
  return out;
}
