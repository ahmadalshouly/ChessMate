import type { Lesson, LessonArrow } from '@chessmate/core';

import type { Arrow } from '@/components/BoardArrows';

/**
 * Arrow colours on teaching boards. Colour carries meaning here (as on the
 * board elsewhere): green for the move to play, red for an attack, blue for a
 * defender. Translucent so the pieces under them stay readable.
 */
export const LESSON_ARROW_COLORS: Record<NonNullable<LessonArrow['tone']>, string> = {
  move: 'rgba(38, 158, 92, 0.82)',
  attack: 'rgba(214, 64, 52, 0.78)',
  defend: 'rgba(52, 118, 214, 0.78)',
};

export function lessonArrows(arrows: LessonArrow[] | undefined): Arrow[] {
  return (arrows ?? []).map((a) => ({ from: a.from, to: a.to, color: LESSON_ARROW_COLORS[a.tone ?? 'move'] }));
}

export function lessonPuzzleCount(lesson: Lesson): number {
  return lesson.steps.filter((s) => s.kind === 'puzzle').length;
}
