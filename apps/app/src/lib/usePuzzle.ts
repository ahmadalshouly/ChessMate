import {
  Game,
  nextHint,
  parseUci,
  playPuzzleMove,
  puzzleFen,
  revealSolution,
  startPuzzle,
  type Color,
  type PuzzleDto,
  type PuzzleHint,
  type PuzzleState,
  type Square,
} from '@chessmate/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export type PuzzleFeedback = 'loading' | 'yourMove' | 'correct' | 'wrong' | 'solved' | 'failed';

export interface PuzzleFinish {
  puzzle: PuzzleDto;
  solved: boolean;
  /** Solved first try with no hints. */
  clean: boolean;
  /** Every move the solver tried, in order (wrong ones included) for server grading. */
  moves: string[];
  hints: number;
  timeMs: number;
}

const SETUP_DELAY_MS = 600;
const REPLY_DELAY_MS = 400;

/**
 * Drives one puzzle on the board: plays the opponent's setup move, checks the
 * solver's moves, animates replies, and hands out hints.
 *
 * `failOnMistake` (streak and rush) ends the puzzle at the first wrong move;
 * otherwise the solver may retry, but the puzzle no longer counts as clean.
 */
export function usePuzzle(puzzle: PuzzleDto | null, opts: { failOnMistake?: boolean; onFinish?: (f: PuzzleFinish) => void } = {}) {
  const [state, setState] = useState<PuzzleState | null>(null);
  const [fen, setFen] = useState<string>(puzzle?.fen ?? new Game().fen);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [feedback, setFeedback] = useState<PuzzleFeedback>('loading');
  const [hint, setHint] = useState<PuzzleHint | null>(null);
  const [busy, setBusy] = useState(true);
  const tried = useRef<string[]>([]);
  const startedAt = useRef(Date.now());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finished = useRef(false);
  const onFinish = useRef(opts.onFinish);
  onFinish.current = opts.onFinish;

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const show = (s: PuzzleState) => {
    setFen(puzzleFen(s));
    const last = s.played[s.played.length - 1];
    if (last) {
      const { from, to } = parseUci(last);
      setLastMove({ from, to });
    }
  };

  const finish = useCallback(
    (s: PuzzleState) => {
      if (finished.current || !puzzle) return;
      finished.current = true;
      const solved = s.status === 'solved';
      setFeedback(solved ? 'solved' : 'failed');
      onFinish.current?.({
        puzzle,
        solved,
        clean: solved && s.mistakes === 0 && s.hints === 0,
        moves: [...tried.current],
        hints: s.hints,
        timeMs: Date.now() - startedAt.current,
      });
    },
    [puzzle],
  );

  // New puzzle: show the starting position, then play the setup move.
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    tried.current = [];
    finished.current = false;
    setHint(null);
    setState(null);
    setLastMove(null);
    if (!puzzle) {
      setFeedback('loading');
      return;
    }
    setFen(puzzle.fen);
    setBusy(true);
    setFeedback('loading');
    later(() => {
      const s = startPuzzle(puzzle);
      setState(s);
      show(s);
      setBusy(false);
      setFeedback('yourMove');
      startedAt.current = Date.now();
    }, SETUP_DELAY_MS);
    return () => timers.current.forEach(clearTimeout);
  }, [puzzle]);

  const play = (uci: string): boolean => {
    if (!state || busy || state.status !== 'playing') return false;
    const r = playPuzzleMove(state, uci);
    if (r.kind === 'illegal') return false;
    tried.current.push(uci);
    setHint(null);
    if (r.kind === 'wrong') {
      setFeedback('wrong');
      if (opts.failOnMistake) {
        const failed = { ...r.state, status: 'failed' as const };
        setState(failed);
        finish(failed);
      } else {
        setState(r.state);
      }
      return false;
    }
    // Show the solver's move first, then the reply.
    const afterSolver = { ...r.state, played: r.state.played.slice(0, state.played.length + 1) };
    show(afterSolver);
    if (r.kind === 'solved') {
      setState(r.state);
      finish(r.state);
      return true;
    }
    setFeedback('correct');
    setBusy(true);
    setState(r.state);
    later(() => {
      show(r.state);
      setBusy(false);
      if (r.state.status === 'solved') finish(r.state);
      else setFeedback('yourMove');
    }, REPLY_DELAY_MS);
    return true;
  };

  const askHint = () => {
    if (!state || busy) return;
    const h = nextHint(state);
    if (!h) return;
    setState(h.state);
    setHint(h.hint);
  };

  /** Gives up and plays the rest of the line move by move. */
  const reveal = () => {
    if (!state || state.status !== 'playing') return;
    const done = revealSolution(state);
    setState(done);
    setBusy(true);
    finish(done);
    const rest = done.played.slice(state.played.length);
    rest.forEach((_, i) => {
      later(
        () => show({ ...done, played: done.played.slice(0, state.played.length + i + 1) }),
        (i + 1) * 500,
      );
    });
  };

  const solver: Color = state?.solver ?? (puzzle ? (new Game(puzzle.fen).turn === 'w' ? 'b' : 'w') : 'w');

  return {
    fen,
    lastMove,
    feedback,
    hint,
    solver,
    canMove: !!state && !busy && state.status === 'playing',
    mistakes: state?.mistakes ?? 0,
    hintsUsed: state?.hints ?? 0,
    play,
    askHint,
    reveal,
  };
}
