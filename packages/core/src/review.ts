import { Chess } from 'chess.js';
import { buildCoachPrompt, quickFeedback, type CoachContext } from './coach';
import { formatScore, gameAccuracy, isError, judgeMove, type MoveClass, type MoveJudgement, type Score } from './evaluation';
import { analyzePosition, pieceName, sacrificedMaterial, type PositionInsight } from './threats';
import { opposite, type Color, type PieceType } from './types';

/* ------------------------------------------------------------------------ */
/* Engine analysis interface                                                 */
/*                                                                           */
/* This is the contract between the engine-analysis service (Stockfish, run  */
/* on the server or in the client) and the AI coach. The engine produces a   */
/* GameAnalysis; the coach only ever explains these facts.                   */
/* ------------------------------------------------------------------------ */

export const GAME_ANALYSIS_VERSION = 1;

/** Engine facts about one played move. All scores are from White's point of view. */
export interface AnalyzedMove {
  /** 1-based half-move number. */
  ply: number;
  /** Move as played, in SAN and UCI. */
  san: string;
  uci: string;
  /** Position before the move. */
  fenBefore: string;
  /** Engine's preferred move in the position before, with its principal variation. */
  best: {
    san: string;
    uci: string;
    /** Principal variation in SAN, starting with the best move. */
    line: string[];
    score: Score;
  };
  /** Engine score after the played move (with best play from there). */
  scoreAfter: Score;
  /** Optional: the line the engine expects after the played move, in SAN. */
  refutation?: string[];
  /** Number of legal moves in fenBefore. 1 means the move was forced. */
  legalMoveCount?: number;
  /** True when the move is in the opening book. */
  book?: boolean;
  /** Seconds the mover spent on this move, when known. */
  timeSpentSec?: number;
}

export interface GameAnalysisPlayer {
  name: string;
  rating?: number;
}

/** Full-game engine analysis. Produced by the engine thread, consumed by the coach. */
export interface GameAnalysis {
  version: typeof GAME_ANALYSIS_VERSION;
  gameId?: string;
  white: GameAnalysisPlayer;
  black: GameAnalysisPlayer;
  result?: '1-0' | '0-1' | '1/2-1/2' | '*';
  /** How the game ended, e.g. "checkmate", "resignation", "timeout". */
  termination?: string;
  /** Display form such as "5+3". */
  timeControl?: string;
  opening?: { eco?: string; name: string };
  engine?: { name: string; depth?: number };
  /** Every played move, in order, starting at ply 1. */
  moves: AnalyzedMove[];
}

/**
 * Implemented by the engine-analysis service. The coach endpoint uses it when
 * a client sends only the moves of a game instead of a finished analysis.
 */
export interface GameAnalyzer {
  analyzeGame(input: {
    gameId?: string;
    initialFen?: string;
    /** Moves in UCI order. */
    uciMoves: string[];
    white: GameAnalysisPlayer;
    black: GameAnalysisPlayer;
    result?: GameAnalysis['result'];
  }): Promise<GameAnalysis>;
}

/* ------------------------------------------------------------------------ */
/* Coach output                                                              */
/* ------------------------------------------------------------------------ */

export interface CoachMoveNote {
  ply: number;
  /** Move number as shown to players, e.g. "14." or "14...". */
  moveLabel: string;
  san: string;
  mover: Color;
  classification: MoveClass;
  /** Plain-language explanation of why the move was good or bad. */
  explanation: string;
  /** The better move in SAN, when the played move was not best. */
  betterMove?: string;
  /** Short tag such as "hanging piece", "missed fork", "king safety". */
  theme?: string;
  fenBefore: string;
}

export interface CoachStudyTheme {
  theme: string;
  why: string;
}

export interface CoachReview {
  /** Side the review is written for. */
  perspective: Color;
  summary: string;
  keyMoments: CoachMoveNote[];
  /** Recurring mistakes, in plain language. */
  mistakePatterns: string[];
  studyThemes: CoachStudyTheme[];
  accuracy: Record<Color, number>;
  counts: Record<Color, Partial<Record<MoveClass, number>>>;
  /** "ai" when written by the language model, "offline" for the rule-based fallback. */
  source: 'ai' | 'offline';
}

export interface CoachChatTurn {
  role: 'user' | 'coach';
  text: string;
}

/** Ask the coach about one position, optionally inside a reviewed game. */
export interface CoachChatRequest {
  fen: string;
  /** Side the player is on (defaults to the side to move). */
  perspective?: Color;
  playerRating?: number;
  /** Engine facts for this position, when the client has them. */
  engine?: { bestMove?: string; line?: string[]; score?: Score };
  /** Context from the reviewed game, e.g. the move just played. */
  lastMove?: { san: string; classification?: MoveClass };
  messages: CoachChatTurn[];
}

export interface CoachChatReply {
  reply: string;
  source: 'ai' | 'offline';
}

/* ------------------------------------------------------------------------ */
/* Turning engine output into coach facts                                    */
/* ------------------------------------------------------------------------ */

export interface JudgedMove {
  move: AnalyzedMove;
  mover: Color;
  fenAfter: string;
  judgement: MoveJudgement;
}

export interface ReviewFacts {
  perspective: Color;
  judged: JudgedMove[];
  accuracy: Record<Color, number>;
  counts: Record<Color, Partial<Record<MoveClass, number>>>;
  /** Moves worth explaining, most important first then re-sorted by ply. */
  keyMoves: { judged: JudgedMove; context: CoachContext }[];
}

export class AnalysisError extends Error {}

export function moveLabel(ply: number): string {
  const n = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${n}.` : `${n}...`;
}

/** Validates the analysis against the rules of chess and judges every move. */
export function judgeGame(analysis: GameAnalysis): JudgedMove[] {
  if (analysis.version !== GAME_ANALYSIS_VERSION) throw new AnalysisError('Unsupported analysis version');
  if (!Array.isArray(analysis.moves) || analysis.moves.length === 0) throw new AnalysisError('Analysis has no moves');
  if (analysis.moves.length > 600) throw new AnalysisError('Game too long');
  let prev: MoveClass | undefined;
  return analysis.moves.map((m, i) => {
    let chess: Chess;
    try {
      chess = new Chess(m.fenBefore);
    } catch {
      throw new AnalysisError(`Invalid FEN at ply ${i + 1}`);
    }
    const mover = chess.turn() as Color;
    let played;
    try {
      played = chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
    } catch {
      throw new AnalysisError(`Illegal move ${m.uci} at ply ${i + 1}`);
    }
    if (played.san !== m.san) throw new AnalysisError(`Move ${m.san} does not match ${m.uci} at ply ${i + 1}`);
    const judgement: MoveJudgement = m.book
      ? { classification: 'book', loss: 0, accuracy: 100 }
      : judgeMove({
          mover,
          bestScore: m.best.score,
          playedScore: m.scoreAfter,
          playedIsBest: m.best.uci === m.uci,
          legalMoveCount: m.legalMoveCount,
          sacrifice: sacrificedMaterial(chess.fen(), mover, played.captured as PieceType | undefined),
          opponentErred: isError(prev),
        });
    prev = judgement.classification;
    return { move: m, mover, fenAfter: chess.fen(), judgement };
  });
}

const SEVERITY: Partial<Record<MoveClass, number>> = { blunder: 3, mistake: 2, missed: 2, inaccuracy: 1 };

/**
 * Picks the moments worth explaining: the player's own errors first, then the
 * opponent's errors the player could have punished. Keeps the list short so
 * the review stays readable and the prompt stays cheap.
 */
export function prepareReview(analysis: GameAnalysis, perspective: Color, maxKeyMoves = 8): ReviewFacts {
  const judged = judgeGame(analysis);
  const accuracy = { w: 100, b: 100 } as Record<Color, number>;
  const counts = { w: {}, b: {} } as ReviewFacts['counts'];
  for (const c of ['w', 'b'] as const) {
    const mine = judged.filter((j) => j.mover === c);
    accuracy[c] = gameAccuracy(mine.filter((j) => j.judgement.classification !== 'book').map((j) => j.judgement.accuracy));
    for (const j of mine) counts[c][j.judgement.classification] = (counts[c][j.judgement.classification] ?? 0) + 1;
  }

  const playerRating = (perspective === 'w' ? analysis.white : analysis.black).rating;
  const ranked = judged
    .filter((j) => SEVERITY[j.judgement.classification])
    .map((j) => ({
      j,
      // Own mistakes matter most; opponent errors are "missed chances" for the player.
      weight: SEVERITY[j.judgement.classification]! * (j.mover === perspective ? 10 : 4) + j.judgement.loss,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxKeyMoves)
    .map((x) => x.j)
    .sort((a, b) => a.move.ply - b.move.ply);

  const keyMoves = ranked.map((j) => ({
    judged: j,
    context: {
      fenBefore: j.move.fenBefore,
      movePlayed: j.move.san,
      mover: j.mover,
      playerRating,
      bestMove: j.move.best.san,
      bestLine: j.move.best.line.slice(0, 8),
      scoreBefore: j.move.best.score,
      scoreAfter: j.move.scoreAfter,
      judgement: j.judgement,
      insightAfter: analyzePosition(j.fenAfter, j.mover),
    } satisfies CoachContext,
  }));

  return { perspective, judged, accuracy, counts, keyMoves };
}

/** Text block describing the whole game for the language model. */
export function buildReviewPrompt(analysis: GameAnalysis, facts: ReviewFacts): string {
  const side = facts.perspective === 'w' ? 'White' : 'Black';
  const clean = (s: string) => s.replace(/[\r\n<>]/g, ' ').slice(0, 40);
  const lines = [
    `Review this game for the ${side} player.`,
    `White: ${clean(analysis.white.name)}${analysis.white.rating ? ` (${Math.round(analysis.white.rating)})` : ''}`,
    `Black: ${clean(analysis.black.name)}${analysis.black.rating ? ` (${Math.round(analysis.black.rating)})` : ''}`,
  ];
  if (analysis.result) lines.push(`Result: ${analysis.result}${analysis.termination ? ` by ${clean(analysis.termination)}` : ''}`);
  if (analysis.timeControl) lines.push(`Time control: ${clean(analysis.timeControl)}`);
  if (analysis.opening) lines.push(`Opening: ${clean(analysis.opening.name)}${analysis.opening.eco ? ` (${analysis.opening.eco})` : ''}`);
  lines.push(`Accuracy: White ${facts.accuracy.w}%, Black ${facts.accuracy.b}%`);
  lines.push(
    `Error counts: White ${countText(facts.counts.w)}; Black ${countText(facts.counts.b)}`,
    '',
    'Moves (SAN, engine eval after the move, classification):',
    facts.judged
      .map((j) => `${moveLabel(j.move.ply)} ${j.move.san} [${formatScore(j.move.scoreAfter)}${tag(j.judgement.classification)}]`)
      .join(' '),
    '',
  );
  if (facts.keyMoves.length === 0) {
    lines.push('No inaccuracies, mistakes or blunders were found.');
  }
  facts.keyMoves.forEach(({ judged, context }, i) => {
    const who = judged.mover === facts.perspective ? 'the player' : 'the opponent';
    lines.push(`--- Key moment ${i + 1}: ply ${judged.move.ply}, ${moveLabel(judged.move.ply)} ${judged.move.san} by ${who} ---`);
    lines.push(buildCoachPrompt(context));
    if (judged.move.refutation?.length) lines.push(`Engine line after the played move: ${judged.move.refutation.slice(0, 8).join(' ')}`);
    if (judged.move.timeSpentSec !== undefined) lines.push(`Time spent: ${Math.round(judged.move.timeSpentSec)}s`);
    lines.push('');
  });
  return lines.join('\n');
}

function tag(c: MoveClass): string {
  const tags: Partial<Record<MoveClass, string>> = { masterpiece: ' !!!', brilliant: ' !!', blunder: ' ??', mistake: ' ?', missed: ' ?! (missed chance)', inaccuracy: ' ?!' };
  return tags[c] ?? '';
}

function countText(c: Partial<Record<MoveClass, number>>): string {
  return `${c.blunder ?? 0} blunders, ${c.mistake ?? 0} mistakes, ${c.inaccuracy ?? 0} inaccuracies`;
}

/** Rule-based review used when no language model is configured or it fails. */
export function offlineReview(facts: ReviewFacts): CoachReview {
  const me = facts.perspective;
  const keyMoments: CoachMoveNote[] = facts.keyMoves.map(({ judged, context }) => ({
    ply: judged.move.ply,
    moveLabel: moveLabel(judged.move.ply),
    san: judged.move.san,
    mover: judged.mover,
    classification: judged.judgement.classification,
    explanation:
      judged.mover === me
        ? quickFeedback(context)
        : `Your opponent's ${judged.move.san} was ${judged.judgement.classification === 'inaccuracy' ? 'an' : 'a'} ${judged.judgement.classification}. ${judged.move.best.san} was stronger, so look for a way to punish it.`,
    betterMove: judged.move.best.uci !== judged.move.uci ? judged.move.best.san : undefined,
    theme: offlineTheme(context.insightAfter),
    fenBefore: judged.move.fenBefore,
  }));
  const mine = facts.counts[me];
  const errors = (mine.blunder ?? 0) + (mine.mistake ?? 0);
  const summary =
    errors === 0
      ? `Clean game: ${facts.accuracy[me]}% accuracy with no serious mistakes.`
      : `You played at ${facts.accuracy[me]}% accuracy with ${countText(mine)}. Go through the key moments below to see where the game turned.`;
  const themes = [...new Set(keyMoments.filter((k) => k.mover === me && k.theme).map((k) => k.theme!))];
  return {
    perspective: me,
    summary,
    keyMoments,
    mistakePatterns: themes.map((t) => `Several errors involved ${t}.`),
    studyThemes: themes.slice(0, 3).map((t) => ({ theme: t, why: 'It came up in your mistakes this game.' })),
    accuracy: facts.accuracy,
    counts: facts.counts,
    source: 'offline',
  };
}

function offlineTheme(insight: PositionInsight): string | undefined {
  if (insight.threats.some((t) => t.kind === 'mate')) return 'king safety';
  if (insight.threats.some((t) => t.kind === 'fork')) return 'forks';
  if (insight.hanging.length) return 'hanging pieces';
  if (insight.threats.some((t) => t.kind === 'capture')) return 'loose pieces';
  return undefined;
}

/** Facts about a single position for the chat coach. */
export function buildChatFacts(req: CoachChatRequest): string {
  let chess: Chess;
  try {
    chess = new Chess(req.fen);
  } catch {
    throw new AnalysisError('Invalid FEN');
  }
  const toMove = chess.turn() as Color;
  const me = req.perspective ?? toMove;
  const mine = analyzePosition(req.fen, me);
  const theirs = analyzePosition(req.fen, opposite(me));
  const name = (c: Color) => (c === 'w' ? 'White' : 'Black');
  const lines = [
    `Position (FEN): ${req.fen}`,
    `Side to move: ${name(toMove)}. The player is ${name(me)}.`,
    `Legal moves: ${chess.moves().join(' ') || 'none'}`,
  ];
  if (chess.isCheckmate()) lines.push('The position is checkmate.');
  else if (chess.isStalemate()) lines.push('The position is stalemate.');
  if (req.playerRating) lines.push(`Player rating: ${Math.round(req.playerRating)}`);
  if (req.lastMove) lines.push(`Move just played: ${req.lastMove.san}${req.lastMove.classification ? ` (${req.lastMove.classification})` : ''}`);
  if (req.engine?.bestMove) lines.push(`Engine best move: ${req.engine.bestMove}`);
  if (req.engine?.line?.length) lines.push(`Engine main line: ${req.engine.line.slice(0, 10).join(' ')}`);
  if (req.engine?.score) lines.push(`Engine evaluation (White's view): ${formatScore(req.engine.score)}`);
  const describe = (insight: PositionInsight, who: string) => {
    if (insight.hanging.length) lines.push(`${who} pieces that can be won: ${insight.hanging.map((h) => `${pieceName(h.piece)} on ${h.square}`).join(', ')}`);
    if (insight.threats.length) lines.push(`Threats against ${who}: ${insight.threats.slice(0, 4).map((t) => t.description).join('; ')}`);
  };
  describe(mine, `${name(me)}'s`);
  describe(theirs, `${name(opposite(me))}'s`);
  return lines.join('\n');
}
