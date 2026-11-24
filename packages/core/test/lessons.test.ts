import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { LESSONS, LESSON_CHAPTERS, LessonInputError, cleanLessonInput, isValidPuzzle, lessonById, nextLesson, resolveLessonPuzzles, squaresBetween, type LessonExplainStep } from '../src';

const explainSteps = LESSONS.flatMap((l) => l.steps.filter((s): s is LessonExplainStep => s.kind === 'explain').map((s) => ({ lesson: l.id, step: s })));

/** The move an arrow from the side to move describes, if it is legal. */
function arrowMove(fen: string, from: string, to: string) {
  const c = new Chess(fen);
  return c.moves({ verbose: true }).find((m) => m.from === from && m.to === to) ?? null;
}

describe('lessons', () => {
  it('have unique ids and at least one explanation and three puzzles', () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LESSON_CHAPTERS.length).toBeGreaterThan(0);
    for (const l of LESSONS) {
      expect(l.steps.some((s) => s.kind === 'explain'), l.id).toBe(true);
      expect(l.steps.filter((s) => s.kind === 'puzzle').length, l.id).toBeGreaterThanOrEqual(3);
      expect(l.readMore.every((r) => r.url.startsWith('https://')), l.id).toBe(true);
    }
  });

  it('use legal positions and arrows on real squares', () => {
    for (const { lesson, step } of explainSteps) {
      const c = new Chess(step.fen); // throws on a bad FEN
      expect(c.isGameOver(), `${lesson}: ${step.title}`).toBe(false);
      for (const a of step.arrows ?? []) {
        expect(a.from, lesson).toMatch(/^[a-h][1-8]$/);
        expect(a.to, lesson).toMatch(/^[a-h][1-8]$/);
      }
    }
  });

  it('practice puzzles are valid Lichess puzzles', () => {
    for (const l of LESSONS) for (const s of l.steps) if (s.kind === 'puzzle') expect(isValidPuzzle(s.puzzle), `${l.id} ${s.puzzle.id}`).toBe(true);
  });

  it('teaching moves do what the text says', () => {
    const play = (fen: string, from: string, to: string) => {
      const m = arrowMove(fen, from, to);
      expect(m, `${from}${to} in ${fen}`).not.toBeNull();
      const c = new Chess(fen);
      c.move({ from: m!.from, to: m!.to, promotion: 'q' });
      return c;
    };
    // Mates
    expect(play('7k/8/6K1/8/8/8/8/1Q6 w - - 0 1', 'b1', 'b8').isCheckmate()).toBe(true);
    expect(play('6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', 'e1', 'e8').isCheckmate()).toBe(true);
    expect(play('6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', 'g5', 'f7').isCheckmate()).toBe(true);
    expect(play('7k/1R6/5N2/8/8/8/8/6K1 w - - 0 1', 'b7', 'h7').isCheckmate()).toBe(true);
    expect(play('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'h5', 'f7').isCheckmate()).toBe(true);
    // Smothered: Qg8+ Rxg8 Nf7#
    const sm = play('2r4k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1', 'c4', 'g8');
    expect(sm.moves()).toEqual(['Rxg8']);
    sm.move('Rxg8');
    expect(sm.move('Nf7').san).toBe('Nf7#');
    // Ladder: after Ra7 every black move allows Rb8#
    const ladder = play('4k3/8/8/8/8/8/R7/1R4K1 w - - 0 1', 'a2', 'a7');
    for (const reply of ladder.moves()) {
      const c = new Chess(ladder.fen());
      c.move(reply);
      expect(c.move('Rb8').san, reply).toBe('Rb8#');
    }
    // Forks, skewers, discovered and double checks
    const fork = play('q3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5', 'c7');
    expect(fork.inCheck()).toBe(true);
    expect(fork.attackers('a8', 'w')).toContain('c7');
    const pawnFork = play('4k3/8/2n1b3/8/3P4/8/8/4K3 w - - 0 1', 'd4', 'd5');
    expect(pawnFork.attackers('c6', 'w')).toContain('d5');
    expect(pawnFork.attackers('e6', 'w')).toContain('d5');
    const skewer = play('7q/8/8/4k3/8/8/8/2B1K3 w - - 0 1', 'c1', 'b2');
    expect(skewer.inCheck()).toBe(true);
    const rookSkewer = play('8/8/8/8/1r3k2/8/8/4K2R w - - 0 1', 'h1', 'h4');
    expect(rookSkewer.inCheck()).toBe(true);
    const disc = play('4k3/q7/8/4N3/8/8/8/4RK2 w - - 0 1', 'e5', 'c6');
    expect(disc.attackers('e8', 'w')).toEqual(['e1']);
    expect(disc.attackers('a7', 'w')).toContain('c6');
    const dbl = play('4k3/3p1p2/8/8/4N3/8/8/4R1K1 w - - 0 1', 'e4', 'd6');
    expect(dbl.attackers('e8', 'w').sort()).toEqual(['d6', 'e1']);
    expect(dbl.moves().every((m) => m.startsWith('K'))).toBe(true);
    // Pins: the pinned knight has no legal moves
    expect(new Chess('4k3/8/2n5/1B6/8/8/8/4K3 b - - 0 1').moves({ square: 'c6' })).toEqual([]);
    // Square rule: the pawn queens before the king arrives
    const race = new Chess('8/8/8/8/P7/8/8/K6k w - - 0 1');
    const dist = (sq: string) => Math.max(Math.abs(sq.charCodeAt(0) - 97), Math.abs(8 - Number(sq[1])));
    for (const push of ['a5', 'a6', 'a7', 'a8=Q']) {
      race.move(push);
      if (push === 'a8=Q') break;
      // Black's king heads straight for the corner.
      const chase = race.moves({ verbose: true }).sort((x, y) => dist(x.to) - dist(y.to))[0]!;
      race.move(chase.san);
    }
    expect(race.get('a8')?.type).toBe('q');
  });

  it('look up lessons and the next one', () => {
    expect(lessonById('fork')?.title).toBe('Forks');
    expect(lessonById('nope')).toBeUndefined();
    expect(nextLesson(LESSONS[0]!.id)?.id).toBe(LESSONS[1]!.id);
    expect(nextLesson(LESSONS[LESSONS.length - 1]!.id)).toBeUndefined();
    expect(squaresBetween('a4', 'e8')).toHaveLength(25);
  });
});

describe('lesson input from the console', () => {
  const ok = {
    id: 'my-lesson',
    chapterId: 'tactics',
    title: '  Title  ',
    summary: 'Summary',
    steps: [{ kind: 'explain', title: 'T', body: 'B', fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', arrows: [{ from: 'e1', to: 'e2' }], highlights: ['e2', 'e2'] }],
  };

  it('tidies a valid lesson', () => {
    const l = cleanLessonInput(ok);
    expect(l.title).toBe('Title');
    expect(l.level).toBe('beginner');
    expect(l.icon).toBe('book-outline');
    expect(l.published).toBe(true);
    const step = l.steps[0] as LessonExplainStep;
    expect(step.arrows).toEqual([{ from: 'e1', to: 'e2', tone: 'move' }]);
    expect(step.highlights).toEqual(['e2']);
  });

  it('refuses bad input with the step that is wrong', () => {
    expect(() => cleanLessonInput({ ...ok, id: 'x' })).toThrow(LessonInputError);
    expect(() => cleanLessonInput({ ...ok, steps: [] })).toThrow(/at least one step/);
    expect(() => cleanLessonInput({ ...ok, practiceTheme: 'madeUp' })).toThrow(/theme/);
    expect(() => cleanLessonInput({ ...ok, readMore: [{ title: 'x', url: 'http://insecure' }] })).toThrow(/https/);
    expect(() => cleanLessonInput({ ...ok, steps: [ok.steps[0], { kind: 'explain', title: 'T', body: 'B', fen: '8/8/8/8/8/8/8/8 w - - 0 1' }] })).toThrow(/Step 2/);
  });

  it('looks puzzles up by id', () => {
    const p = LESSONS[0]!.steps.find((s) => s.kind === 'puzzle')!;
    if (p.kind !== 'puzzle') throw new Error('no puzzle');
    const input = cleanLessonInput({ ...ok, steps: [{ kind: 'puzzle', prompt: 'Go', puzzleId: p.puzzle.id }] });
    expect(resolveLessonPuzzles(input, (id) => (id === p.puzzle.id ? p.puzzle : undefined)).steps[0]).toEqual({ kind: 'puzzle', prompt: 'Go', puzzle: p.puzzle });
    expect(() => resolveLessonPuzzles(input, () => undefined)).toThrow(/no puzzle/);
  });
});
