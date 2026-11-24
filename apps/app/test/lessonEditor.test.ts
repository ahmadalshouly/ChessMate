import { describe, expect, it } from 'vitest';

import { formatArrows, lessonInputFrom, moveItem, newExplainStep, parseArrows, parseSquares, draftProblems, emptyLesson } from '../src/features/learn/lessonEditor';

describe('lesson editor text fields', () => {
  it('reads arrows with optional tones and writes them back', () => {
    const { arrows, bad } = parseArrows('e2e4  c6-e5:attack, d1d8:DEFEND');
    expect(bad).toBeNull();
    expect(arrows).toEqual([
      { from: 'e2', to: 'e4', tone: 'move' },
      { from: 'c6', to: 'e5', tone: 'attack' },
      { from: 'd1', to: 'd8', tone: 'defend' },
    ]);
    expect(formatArrows(arrows)).toBe('e2e4 c6e5:attack d1d8:defend');
  });

  it('points at the first word that is not an arrow or a square', () => {
    expect(parseArrows('e2e4 e9e4').bad).toBe('e9e4');
    expect(parseArrows('e2e2').bad).toBe('e2e2');
    expect(parseArrows('e2e4:shout').bad).toBe('e2e4:shout');
    expect(parseSquares('e4 D5').squares).toEqual(['e4', 'd5']);
    expect(parseSquares('e4 z5').bad).toBe('z5');
  });

  it('builds the request the server expects and flags bad steps', () => {
    const d = emptyLesson('basics');
    d.id = ' my-lesson ';
    d.title = 'Forks';
    d.readMore = [{ title: '', url: '' }];
    d.steps = [{ ...newExplainStep(), arrows: 'e1e2', highlights: 'e4' }, { kind: 'puzzle', key: 'p', prompt: 'Find it', puzzleId: ' abc12 ', puzzle: null }];
    const input = lessonInputFrom(d);
    expect(input.id).toBe('my-lesson');
    expect(input.readMore).toEqual([]);
    expect(input.steps[1]).toEqual({ kind: 'puzzle', prompt: 'Find it', puzzleId: 'abc12' });
    expect(draftProblems(d).size).toBe(0);
    d.steps[0] = { ...(d.steps[0] as ReturnType<typeof newExplainStep>), highlights: 'e4 x' };
    expect([...draftProblems(d).values()][0]).toContain('"x"');
  });

  it('moves list items and ignores moves off the ends', () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
});
