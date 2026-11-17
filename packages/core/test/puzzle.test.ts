import { describe, expect, it } from 'vitest';
import {
  Game,
  gradeAttempt,
  nextHint,
  parsePuzzleCsvLine,
  playPuzzleMove,
  puzzleFen,
  puzzleScore,
  puzzleToCsvLine,
  revealSolution,
  runTargetRating,
  splitCsvLine,
  startPuzzle,
  updatePuzzleRating,
  DEFAULT_PUZZLE_RATING,
} from '../src';

// Original test positions in the database's CSV format.
const MATE2 = 'cm0008,5r1k/6pp/1q5N/3Q4/8/8/PP3PPP/6K1 b - - 0 1,b6b2 d5g8 f8g8 h6f7,1300,80,100,0,mate mateIn2 smotheredMate,,';
const FORK = 'cm0005,r3k3/pp3ppp/8/1N6/8/8/PPP2PPP/6K1 b - - 0 1,h7h6 b5c7 e8d7 c7a8,1000,80,100,0,fork,https://example.org/g,Opening_Name';

describe('puzzle CSV', () => {
  it('parses a row and round-trips', () => {
    const p = parsePuzzleCsvLine(FORK, { validate: true })!;
    expect(p.id).toBe('cm0005');
    expect(p.moves).toEqual(['h7h6', 'b5c7', 'e8d7', 'c7a8']);
    expect(p.rating).toBe(1000);
    expect(p.themes).toEqual(['fork']);
    expect(p.gameUrl).toBe('https://example.org/g');
    expect(p.openingTags).toEqual(['Opening_Name']);
    expect(parsePuzzleCsvLine(puzzleToCsvLine(p))).toEqual(p);
  });
  it('skips header, blanks and broken rows', () => {
    expect(parsePuzzleCsvLine('PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags')).toBeNull();
    expect(parsePuzzleCsvLine('')).toBeNull();
    expect(parsePuzzleCsvLine('x,8/8/8/8/8/8/8/8 w - - 0 1,e2e4')).toBeNull();
    expect(parsePuzzleCsvLine(FORK.replace('b5c7', 'b5c8'), { validate: true })).toBeNull();
  });
  it('splits quoted fields', () => {
    expect(splitCsvLine('a,"b,c","f""g"')).toEqual(['a', 'b,c', 'f"g']);
  });
});

describe('solving', () => {
  const mate2 = parsePuzzleCsvLine(MATE2)!;

  it('plays the setup move and gives the solver the other colour', () => {
    const s = startPuzzle(mate2);
    expect(s.solver).toBe('w');
    expect(new Game(puzzleFen(s)).turn).toBe('w');
  });

  it('accepts the line, animates the reply and finishes solved', () => {
    let s = startPuzzle(mate2);
    const r1 = playPuzzleMove(s, 'd5g8');
    expect(r1.kind).toBe('correct');
    if (r1.kind !== 'correct') return;
    expect(r1.reply).toBe('f8g8');
    s = r1.state;
    const r2 = playPuzzleMove(s, 'h6f7');
    expect(r2.kind).toBe('solved');
    expect(puzzleScore(r2.state)).toBe(1);
  });

  it('rejects a wrong move without changing the position', () => {
    const s = startPuzzle(mate2);
    const r = playPuzzleMove(s, 'd5d1');
    expect(r.kind).toBe('wrong');
    expect(r.state.played).toEqual(s.played);
    expect(r.state.mistakes).toBe(1);
    expect(playPuzzleMove(s, 'a1a8').kind).toBe('illegal');
  });

  it('accepts any mating move on the last step', () => {
    // Back rank: both Rd8 and an alternative mate would count.
    const p = parsePuzzleCsvLine('t1,6k1/5ppp/p7/8/8/8/5PPP/3R2K1 b - - 0 1,a6a5 d1d8,700,80,100,0,mate,,')!;
    expect(playPuzzleMove(startPuzzle(p), 'd1d8').kind).toBe('solved');
  });

  it('hints show the piece, then the move, and cost the clean solve', () => {
    const s = startPuzzle(mate2);
    const h1 = nextHint(s)!;
    expect(h1.hint).toMatchObject({ level: 1, from: 'd5' });
    const h2 = nextHint(h1.state)!;
    expect(h2.hint).toMatchObject({ level: 2, from: 'd5', to: 'g8', text: 'Play Qg8+.' });
    let st = h2.state;
    for (const m of ['d5g8', 'h6f7']) st = playPuzzleMove(st, m).state;
    expect(st.status).toBe('solved');
    expect(puzzleScore(st)).toBe(0);
  });

  it('reveal plays out the whole line as failed', () => {
    const s = revealSolution(startPuzzle(mate2));
    expect(s.status).toBe('failed');
    expect(s.played).toEqual(mate2.moves);
  });
});

describe('grading and rating', () => {
  const mate2 = parsePuzzleCsvLine(MATE2)!;
  it('grades submitted moves on the server side', () => {
    expect(gradeAttempt(mate2, ['d5g8', 'h6f7'], 0)).toEqual({ solved: true, score: 1 });
    expect(gradeAttempt(mate2, ['d5g8', 'h6f7'], 1)).toEqual({ solved: true, score: 0 });
    expect(gradeAttempt(mate2, ['d5g8'], 0).solved).toBe(false);
    expect(gradeAttempt(mate2, ['h6f7', 'd5g8', 'h6f7'], 0).solved).toBe(false);
  });
  it('moves the rating up on a solve and down on a miss', () => {
    const up = updatePuzzleRating(DEFAULT_PUZZLE_RATING, { rating: 1500, ratingDeviation: 80 }, 1);
    const down = updatePuzzleRating(DEFAULT_PUZZLE_RATING, { rating: 1500, ratingDeviation: 80 }, 0);
    expect(up.rating).toBeGreaterThan(1500);
    expect(down.rating).toBeLessThan(1500);
  });
  it('run ladders climb', () => {
    expect(runTargetRating('rush', 10)).toBeGreaterThan(runTargetRating('rush', 0));
    expect(runTargetRating('streak', 20)).toBeLessThan(runTargetRating('rush', 20));
  });
});
