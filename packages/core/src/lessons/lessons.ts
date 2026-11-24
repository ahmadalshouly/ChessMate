import type { PuzzleDto } from '../puzzle';
import type { Square } from '../types';
import { LESSON_PUZZLES } from './puzzles';

/**
 * Lessons for the Learn tab. Each lesson explains one idea on example
 * positions, then practises it on real puzzles from the Lichess puzzle
 * database (CC0). The explanations are ChessMate's own writing; "read more"
 * links point to Wikipedia articles (CC BY-SA), which are linked, not copied.
 * Lichess's own Learn and Practice content is AGPL and is not used.
 */

export type LessonLevel = 'beginner' | 'intermediate';

/** An arrow on a teaching board. `tone` picks the colour: a move to play, or an attack. */
export interface LessonArrow {
  from: Square;
  to: Square;
  tone?: 'move' | 'attack' | 'defend';
}

/** A page that explains an idea on a fixed position. */
export interface LessonExplainStep {
  kind: 'explain';
  title: string;
  body: string;
  fen: string;
  /** Side at the bottom of the board. Defaults to the side to move. */
  orientation?: 'w' | 'b';
  arrows?: LessonArrow[];
  /** Squares to ring, e.g. the pinned piece or a key square. */
  highlights?: Square[];
}

/** A Lichess puzzle to solve. The first move of `puzzle.moves` is the opponent's. */
export interface LessonPuzzleStep {
  kind: 'puzzle';
  prompt: string;
  puzzle: PuzzleDto;
}

export type LessonStep = LessonExplainStep | LessonPuzzleStep;

export interface ReadMoreLink {
  title: string;
  url: string;
}

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  level: LessonLevel;
  /** Ionicons name for the lesson card. */
  icon: string;
  steps: LessonStep[];
  /** Lichess puzzle theme for "practise more" in the puzzle trainer. */
  practiceTheme: string;
  readMore: ReadMoreLink[];
}

export interface LessonChapter {
  id: string;
  title: string;
  blurb: string;
  lessons: Lesson[];
}

const wiki = (title: string, page: string): ReadMoreLink => ({ title: `${title} (Wikipedia)`, url: `https://en.wikipedia.org/wiki/${page}` });

/** The lesson's practice puzzles, as steps. */
function practice(id: string, prompt: string): LessonPuzzleStep[] {
  const list = LESSON_PUZZLES[id];
  if (!list) throw new Error(`No practice puzzles for lesson ${id}`);
  return list.map((puzzle) => ({ kind: 'puzzle', prompt, puzzle }));
}

/** Every square in the rectangle between two corners, e.g. the "square of the pawn". */
export function squaresBetween(a: Square, b: Square): Square[] {
  const files = [a.charCodeAt(0), b.charCodeAt(0)].sort((x, y) => x - y);
  const ranks = [Number(a[1]), Number(b[1])].sort((x, y) => x - y);
  const out: Square[] = [];
  for (let f = files[0]!; f <= files[1]!; f++) for (let r = ranks[0]!; r <= ranks[1]!; r++) out.push(`${String.fromCharCode(f)}${r}` as Square);
  return out;
}

const TACTICS: LessonChapter = {
  id: 'tactics',
  title: 'Tactics',
  blurb: 'Short, forcing ideas that win material. Most games below master level are decided by one of these.',
  lessons: [
    {
      id: 'hanging',
      title: 'Hanging pieces',
      summary: 'Spot pieces that can be taken for free, and stop leaving your own.',
      level: 'beginner',
      icon: 'alert-circle-outline',
      practiceTheme: 'hangingPiece',
      readMore: [wiki('Chess tactic', 'Chess_tactic')],
      steps: [
        {
          kind: 'explain',
          title: 'Free material',
          body: 'A piece is hanging when it can be captured and nothing can take back. Here the black knight on d5 is attacked by the queen and nobody defends it, so Qxd5 simply wins a piece. Before every move, look at what your opponent left undefended.',
          fen: '4k3/8/8/3n4/8/8/3Q4/4K3 w - - 0 1',
          arrows: [{ from: 'd2', to: 'd5', tone: 'move' }],
          highlights: ['d5'],
        },
        {
          kind: 'explain',
          title: 'Count attackers and defenders',
          body: 'A defended piece can still be won if it is attacked more times than it is defended. The pawn on e5 is attacked by both white knights and defended only by the knight on c6. White takes on e5, Black takes back, and White takes again: a pawn up.',
          fen: '4k3/8/2n5/4p3/8/3N1N2/8/4K3 w - - 0 1',
          arrows: [
            { from: 'f3', to: 'e5', tone: 'attack' },
            { from: 'd3', to: 'e5', tone: 'attack' },
            { from: 'c6', to: 'e5', tone: 'defend' },
          ],
          highlights: ['e5'],
        },
        {
          kind: 'explain',
          title: 'A habit that saves games',
          body: 'After every move your opponent makes, ask: what does it attack, and which of my pieces are now loose? Then, before you move, check that the piece you move is safe on its new square and that it was not guarding something else.',
          fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
          arrows: [
            { from: 'f3', to: 'e5', tone: 'attack' },
            { from: 'c6', to: 'e5', tone: 'defend' },
          ],
        },
        ...practice('hanging', 'Find the free material.'),
      ],
    },
    {
      id: 'fork',
      title: 'Forks',
      summary: 'One piece attacks two at once, and only one can be saved.',
      level: 'beginner',
      icon: 'git-branch-outline',
      practiceTheme: 'fork',
      readMore: [wiki('Fork', 'Fork_(chess)')],
      steps: [
        {
          kind: 'explain',
          title: 'Two targets, one move',
          body: 'A fork attacks two or more pieces with one move. Knights are the best forkers because their jumps are hard to see coming. Nc7+ checks the king and attacks the queen on a8 at the same time. The king must move, and the queen falls.',
          fen: 'q3k3/8/8/1N6/8/8/8/4K3 w - - 0 1',
          arrows: [
            { from: 'b5', to: 'c7', tone: 'move' },
          ],
          highlights: ['e8', 'a8'],
        },
        {
          kind: 'explain',
          title: 'Every piece can fork',
          body: 'Pawns fork too, and a pawn fork is cheap: whatever Black saves, the pawn wins a piece worth far more. Here d5 attacks both the knight on c6 and the bishop on e6.',
          fen: '4k3/8/2n1b3/8/3P4/8/8/4K3 w - - 0 1',
          arrows: [{ from: 'd4', to: 'd5', tone: 'move' }],
          highlights: ['c6', 'e6'],
        },
        {
          kind: 'explain',
          title: 'Look for checks first',
          body: 'The strongest forks come with check, because your opponent has no time to save the other piece. When you search for a fork, start with the squares from which a knight or queen would check the king.',
          fen: 'q3k3/2N5/8/8/8/8/8/4K3 b - - 1 1',
          orientation: 'w',
          arrows: [
            { from: 'c7', to: 'e8', tone: 'attack' },
            { from: 'c7', to: 'a8', tone: 'attack' },
          ],
        },
        ...practice('fork', 'Find the fork.'),
      ],
    },
    {
      id: 'pin',
      title: 'Pins',
      summary: 'Freeze a piece in front of something more valuable.',
      level: 'beginner',
      icon: 'pin-outline',
      practiceTheme: 'pin',
      readMore: [wiki('Pin', 'Pin_(chess)')],
      steps: [
        {
          kind: 'explain',
          title: 'An absolute pin',
          body: 'The bishop on b5 attacks the knight on c6, and the black king stands behind it on the same diagonal. The knight cannot move at all, because that would expose the king to check. A piece pinned to the king is frozen.',
          fen: '4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1',
          arrows: [{ from: 'b5', to: 'e8', tone: 'attack' }],
          highlights: ['c6'],
        },
        {
          kind: 'explain',
          title: 'A relative pin',
          body: 'Here the rook pins the knight on d5 to the queen on d8. The knight may legally move, but then Rxd8 wins the queen. Pinned pieces make good targets: attack them again, for example with a pawn, and they cannot run away.',
          fen: '3qk3/8/8/3n4/8/8/8/3RK3 w - - 0 1',
          arrows: [{ from: 'd1', to: 'd8', tone: 'attack' }],
          highlights: ['d5'],
        },
        ...practice('pin', 'Use the pin.'),
      ],
    },
    {
      id: 'skewer',
      title: 'Skewers',
      summary: 'Attack a valuable piece, and win the one behind it.',
      level: 'beginner',
      icon: 'remove-outline',
      practiceTheme: 'skewer',
      readMore: [wiki('Skewer', 'Skewer_(chess)')],
      steps: [
        {
          kind: 'explain',
          title: 'A pin in reverse',
          body: 'In a skewer the more valuable piece is in front. Bb2+ checks the king on e5, and the queen on h8 stands behind it on the same diagonal. The king has to step aside, and the bishop takes the queen.',
          fen: '7q/8/8/4k3/8/8/8/2B1K3 w - - 0 1',
          arrows: [
            { from: 'c1', to: 'b2', tone: 'move' },
            { from: 'e5', to: 'h8', tone: 'attack' },
          ],
          highlights: ['e5', 'h8'],
        },
        {
          kind: 'explain',
          title: 'Where skewers hide',
          body: 'Skewers need long-range pieces: bishops, rooks and queens. Watch for an enemy king and queen, or king and rook, standing on the same line, especially in the endgame when the board is open. Here Rh4+ drives the king off the 4th rank and the rook on b4 falls.',
          fen: '8/8/8/8/1r3k2/8/8/4K2R w - - 0 1',
          arrows: [
            { from: 'h1', to: 'h4', tone: 'move' },
            { from: 'f4', to: 'b4', tone: 'attack' },
          ],
          highlights: ['f4', 'b4'],
        },
        ...practice('skewer', 'Find the skewer.'),
      ],
    },
    {
      id: 'discovered',
      title: 'Discovered attacks',
      summary: 'Move one piece to unleash another behind it.',
      level: 'intermediate',
      icon: 'eye-outline',
      practiceTheme: 'discoveredAttack',
      readMore: [wiki('Discovered attack', 'Discovered_attack')],
      steps: [
        {
          kind: 'explain',
          title: 'Two threats from one move',
          body: 'The knight on e5 blocks the rook on e1. When the knight moves, the rook gives check: a discovered check. Nc6+ also attacks the queen on a7. Black has to answer the check, and White wins the queen.',
          fen: '4k3/q7/8/4N3/8/8/8/4RK2 w - - 0 1',
          arrows: [
            { from: 'e5', to: 'c6', tone: 'move' },
            { from: 'e1', to: 'e8', tone: 'attack' },
          ],
          highlights: ['a7'],
        },
        {
          kind: 'explain',
          title: 'Set it up',
          body: 'Look for your own pieces lined up behind each other, with an enemy king or queen at the end of the line. The front piece is then free to go anywhere it likes, even to a square where it can be taken, because the opponent must deal with the attack behind it first.',
          fen: '4k3/q7/2N5/8/8/8/8/4RK2 b - - 1 1',
          orientation: 'w',
          arrows: [
            { from: 'e1', to: 'e8', tone: 'attack' },
            { from: 'c6', to: 'a7', tone: 'attack' },
          ],
        },
        ...practice('discovered', 'Find the discovered attack.'),
      ],
    },
    {
      id: 'doubleCheck',
      title: 'Double check',
      summary: 'Check with two pieces at once: the king must move.',
      level: 'intermediate',
      icon: 'flash-outline',
      practiceTheme: 'doubleCheck',
      readMore: [wiki('Double check', 'Double_check')],
      steps: [
        {
          kind: 'explain',
          title: 'The strongest discovered attack',
          body: 'When the piece that moves also gives check, the king is attacked twice. Nd6+ checks with the knight and uncovers the rook on e1. No single move can block or capture both checkers, so the king has to move.',
          fen: '4k3/3p1p2/8/8/4N3/8/8/4R1K1 w - - 0 1',
          arrows: [
            { from: 'e4', to: 'd6', tone: 'move' },
            { from: 'e1', to: 'e8', tone: 'attack' },
          ],
          highlights: ['e8'],
        },
        {
          kind: 'explain',
          title: 'Why it matters',
          body: 'Because only a king move helps, a double check often works even when the checking pieces can be captured. If the king has few squares, a double check is frequently the start of a mating attack.',
          fen: '4k3/3p1p2/3N4/8/8/8/8/4R1K1 b - - 1 1',
          orientation: 'w',
          arrows: [
            { from: 'd6', to: 'e8', tone: 'attack' },
            { from: 'e1', to: 'e8', tone: 'attack' },
          ],
        },
        ...practice('doubleCheck', 'Find the double check.'),
      ],
    },
  ],
};

const CHECKMATES: LessonChapter = {
  id: 'checkmates',
  title: 'Checkmate patterns',
  blurb: 'The same few mating pictures come up again and again. Learn to recognise them and you will find mates in seconds.',
  lessons: [
    {
      id: 'mateInOne',
      title: 'Checkmate in one',
      summary: 'Check, and no way out: move, block or capture.',
      level: 'beginner',
      icon: 'flag-outline',
      practiceTheme: 'mateIn1',
      readMore: [wiki('Checkmate', 'Checkmate')],
      steps: [
        {
          kind: 'explain',
          title: 'Three ways out of check',
          body: 'A king in check can escape in three ways: move to a safe square, block the check, or capture the checking piece. Checkmate is a check where none of these works. Qb8+ checks along the back rank; the white king covers g7 and h7, and the queen covers g8. That is mate.',
          fen: '7k/8/6K1/8/8/8/8/1Q6 w - - 0 1',
          arrows: [{ from: 'b1', to: 'b8', tone: 'move' }],
          highlights: ['g8', 'g7', 'h7'],
        },
        {
          kind: 'explain',
          title: 'Checks, captures, threats',
          body: 'When you look for a mate, go through every check you have first, even ones that look silly. For each check, count the king\'s escape squares. If there are none, and the check cannot be blocked or captured, you have found it.',
          fen: '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1',
          arrows: [{ from: 'e1', to: 'e8', tone: 'move' }],
        },
        ...practice('mateInOne', 'Checkmate in one move.'),
      ],
    },
    {
      id: 'backRank',
      title: 'Back rank mate',
      summary: 'A king boxed in by its own pawns.',
      level: 'beginner',
      icon: 'reorder-four-outline',
      practiceTheme: 'backRankMate',
      readMore: [wiki('Back-rank checkmate', 'Back-rank_checkmate')],
      steps: [
        {
          kind: 'explain',
          title: 'Trapped by its own pawns',
          body: 'The black king has castled and its three pawns are still on f7, g7 and h7. A rook or queen landing on the back rank gives mate, because the pawns take away every escape square. Re8 is checkmate.',
          fen: '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1',
          arrows: [{ from: 'e1', to: 'e8', tone: 'move' }],
          highlights: ['f7', 'g7', 'h7'],
        },
        {
          kind: 'explain',
          title: 'Give your king air',
          body: 'The cure is a "luft" pawn move such as h3 (or ...h6 for Black) when you have a quiet moment. And when your opponent\'s back rank is weak, look for ways to drive away or exchange the pieces that guard it.',
          fen: '6k1/5pp1/7p/8/8/7P/5PP1/4R1K1 w - - 0 1',
          highlights: ['h2', 'h7'],
        },
        ...practice('backRank', 'Find the back rank mate.'),
      ],
    },
    {
      id: 'smothered',
      title: 'Smothered mate',
      summary: 'A knight mates a king surrounded by its own pieces.',
      level: 'intermediate',
      icon: 'cube-outline',
      practiceTheme: 'smotheredMate',
      readMore: [wiki('Smothered mate', 'Smothered_mate')],
      steps: [
        {
          kind: 'explain',
          title: 'No room to breathe',
          body: 'The black king on h8 is surrounded by its own rook and pawns. A knight check cannot be blocked, so Nf7 is checkmate: the king has no square to go to and nothing can take the knight.',
          fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
          arrows: [{ from: 'g5', to: 'f7', tone: 'move' }],
          highlights: ['g8', 'g7', 'h7'],
        },
        {
          kind: 'explain',
          title: 'The classic combination',
          body: 'Often the pieces around the king are not yet in place. The famous pattern is a queen sacrifice on g8 with check. The knight on h6 guards g8, so the king cannot take: the rook is forced to, which smothers its own king, and the knight mates on f7.',
          fen: '2r4k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1',
          arrows: [
            { from: 'c4', to: 'g8', tone: 'move' },
            { from: 'c8', to: 'g8', tone: 'defend' },
            { from: 'h6', to: 'f7', tone: 'move' },
          ],
        },
        ...practice('smothered', 'Find the smothered mate.'),
      ],
    },
    {
      id: 'arabian',
      title: 'Arabian mate',
      summary: 'Rook and knight team up in the corner.',
      level: 'intermediate',
      icon: 'grid-outline',
      practiceTheme: 'arabianMate',
      readMore: [wiki('Checkmate patterns', 'Checkmate_pattern')],
      steps: [
        {
          kind: 'explain',
          title: 'Rook and knight in the corner',
          body: 'One of the oldest known mates. The knight on f6 guards h7 and g8. When the rook arrives on h7, it checks the king and covers g7, and the knight protects the rook. Rh7 is checkmate.',
          fen: '7k/1R6/5N2/8/8/8/8/6K1 w - - 0 1',
          arrows: [{ from: 'b7', to: 'h7', tone: 'move' }],
          highlights: ['g8', 'g7', 'h7'],
        },
        ...practice('arabian', 'Mate with rook and knight.'),
      ],
    },
    {
      id: 'mateInTwo',
      title: 'Mate in two',
      summary: 'Force the king into a net, then finish it.',
      level: 'intermediate',
      icon: 'layers-outline',
      practiceTheme: 'mateIn2',
      readMore: [wiki('Checkmate patterns', 'Checkmate_pattern')],
      steps: [
        {
          kind: 'explain',
          title: 'The ladder',
          body: 'Two rooks (or a rook and queen) mate a lone king on the edge by taking turns. Ra7 takes away the 7th rank, so the black king is stuck on the 8th. Whatever Black plays, Rb8 is mate. Mates in two are usually a forcing first move that leaves only one reply, then the mate.',
          fen: '4k3/8/8/8/8/8/R7/1R4K1 w - - 0 1',
          arrows: [
            { from: 'a2', to: 'a7', tone: 'move' },
            { from: 'b1', to: 'b8', tone: 'move' },
          ],
        },
        ...practice('mateInTwo', 'Checkmate in two moves.'),
      ],
    },
  ],
};

const ENDGAMES: LessonChapter = {
  id: 'endgames',
  title: 'Endgames',
  blurb: 'When few pieces are left, small details decide. These are the positions every player should know.',
  lessons: [
    {
      id: 'promotion',
      title: 'Passed pawns and promotion',
      summary: 'Can the king catch the pawn? Use the rule of the square.',
      level: 'beginner',
      icon: 'arrow-up-circle-outline',
      practiceTheme: 'promotion',
      readMore: [wiki('Promotion', 'Promotion_(chess)'), wiki('Rule of the square', 'Rule_of_the_square')],
      steps: [
        {
          kind: 'explain',
          title: 'The rule of the square',
          body: 'Draw a square from the pawn to its promotion rank: here a4 to a8, across to e8 and down to e4. If the defending king can step inside that square on its move, it catches the pawn. The black king on h1 is far outside, so a5, a6, a7 and a8 queens.',
          fen: '8/8/8/8/P7/8/8/K6k w - - 0 1',
          arrows: [{ from: 'a4', to: 'a8', tone: 'move' }],
          highlights: squaresBetween('a4', 'e8'),
        },
        {
          kind: 'explain',
          title: 'Push passed pawns',
          body: 'A passed pawn has no enemy pawns in front of it or on the next files. Every square it advances, the more the opponent has to give up to stop it. In practice, look for checks, deflections and sacrifices that clear the way to the last rank.',
          fen: '6k1/1P6/8/8/8/r7/5PPP/6K1 w - - 0 1',
          arrows: [{ from: 'b7', to: 'b8', tone: 'move' }],
          highlights: ['b8'],
        },
        ...practice('promotion', 'Get the pawn through.'),
      ],
    },
    {
      id: 'opposition',
      title: 'King and pawn: the opposition',
      summary: 'Who must give way decides win or draw.',
      level: 'intermediate',
      icon: 'swap-vertical-outline',
      practiceTheme: 'pawnEndgame',
      readMore: [wiki('Opposition', 'Opposition_(chess)')],
      steps: [
        {
          kind: 'explain',
          title: 'Kings face to face',
          body: 'The kings stand on the same file with one square between them. Kings may not touch, so the side that has to move must step aside. Here Black is to move and must give way; the white king walks forward in front of its pawn and White wins. White "has the opposition".',
          fen: '8/8/4k3/8/4K3/4P3/8/8 b - - 0 1',
          orientation: 'w',
          highlights: ['e4', 'e6'],
        },
        {
          kind: 'explain',
          title: 'The same position, White to move',
          body: 'Now White has to move first, so Black keeps the opposition by mirroring the white king. White can\'t get the king in front of the pawn, and with correct defence the game ends in a draw. One tempo makes all the difference.',
          fen: '8/8/4k3/8/4K3/4P3/8/8 w - - 0 1',
          highlights: ['e4', 'e6'],
        },
        {
          kind: 'explain',
          title: 'King in front of the pawn',
          body: 'Rule of thumb: bring your king ahead of your pawn before pushing it. A white king on the 6th rank in front of its pawn wins no matter who is to move (except with a rook pawn).',
          fen: '4k3/8/4K3/4P3/8/8/8/8 b - - 0 1',
          orientation: 'w',
          highlights: ['e6'],
        },
        ...practice('opposition', 'Win the pawn endgame.'),
      ],
    },
    {
      id: 'rookEndgame',
      title: 'Rook endgames',
      summary: 'Lucena to win, Philidor to draw.',
      level: 'intermediate',
      icon: 'business-outline',
      practiceTheme: 'rookEndgame',
      readMore: [wiki('Lucena position', 'Lucena_position'), wiki('Philidor position', 'Philidor_position')],
      steps: [
        {
          kind: 'explain',
          title: 'Lucena: build a bridge',
          body: 'White\'s king is on b8 in front of the pawn, but the black rook keeps it from coming out. The winning plan: check the black king away (Rd1+), bring the rook to the 4th rank (Rd4), then walk the king out. When the checks from behind run out, the rook blocks on b4 and the pawn queens.',
          fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
          arrows: [
            { from: 'c1', to: 'd1', tone: 'move' },
            { from: 'd1', to: 'd4', tone: 'move' },
          ],
          highlights: ['b8', 'b7'],
        },
        {
          kind: 'explain',
          title: 'Philidor: hold the 6th rank',
          body: 'The defending king is in front of the pawn. Black keeps the rook on the 6th rank, so the white king cannot come forward. Only when the pawn advances to e6 does the rook drop to the back of the board and check from behind, because the white king then has no shelter. This is a draw.',
          fen: '4k3/7R/1r6/4PK2/8/8/8/8 b - - 0 1',
          orientation: 'w',
          arrows: [{ from: 'b6', to: 'e6', tone: 'defend' }],
          highlights: ['b6'],
        },
        ...practice('rookEndgame', 'Find the best move in the rook endgame.'),
      ],
    },
  ],
};

const OPENINGS: LessonChapter = {
  id: 'openings',
  title: 'Openings',
  blurb: 'You don\'t need to memorise lines to play the opening well. Follow a few principles and avoid the early traps.',
  lessons: [
    {
      id: 'openingPrinciples',
      title: 'Opening principles',
      summary: 'Centre, development, king safety, and the weak f7 square.',
      level: 'beginner',
      icon: 'book-outline',
      practiceTheme: 'opening',
      readMore: [wiki('Chess opening', 'Chess_opening'), wiki("Scholar's mate", 'Scholar%27s_mate')],
      steps: [
        {
          kind: 'explain',
          title: 'Take the centre',
          body: 'Start with a central pawn, e4 or d4. Pawns in the centre give your pieces room and take squares away from the opponent\'s pieces.',
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          arrows: [
            { from: 'e2', to: 'e4', tone: 'move' },
            { from: 'd2', to: 'd4', tone: 'move' },
          ],
          highlights: ['d4', 'e4', 'd5', 'e5'],
        },
        {
          kind: 'explain',
          title: 'Develop, then castle',
          body: 'Bring out knights and bishops towards the centre, usually knights before bishops, and castle early to tuck the king away and connect the rooks. Try not to move the same piece twice or bring the queen out early without a reason.',
          fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
          arrows: [{ from: 'e1', to: 'g1', tone: 'move' }],
        },
        {
          kind: 'explain',
          title: 'Guard f7 and f2',
          body: 'At the start, f7 is defended only by the king. Here Black played ...Nf6?? and missed that the queen and bishop both aim at f7: Qxf7 is checkmate. Always check what your opponent\'s pieces are aiming at.',
          fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
          arrows: [
            { from: 'h5', to: 'f7', tone: 'move' },
            { from: 'c4', to: 'f7', tone: 'attack' },
          ],
          highlights: ['f7'],
        },
        ...practice('openingPrinciples', 'Punish the opening mistake.'),
      ],
    },
  ],
};

export const LESSON_CHAPTERS: readonly LessonChapter[] = [TACTICS, CHECKMATES, ENDGAMES, OPENINGS];

export const LESSONS: readonly Lesson[] = LESSON_CHAPTERS.flatMap((c) => c.lessons);

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

/** The lesson after this one, across chapters, or undefined for the last. */
export function nextLesson(id: string): Lesson | undefined {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i >= 0 ? LESSONS[i + 1] : undefined;
}

/** Link to a practice puzzle on Lichess, for credit. */
export function lichessPuzzleUrl(id: string): string {
  return `https://lichess.org/training/${id}`;
}

export const LESSON_CREDITS = {
  puzzles: { title: 'Lichess puzzle database', license: 'CC0 1.0', url: 'https://database.lichess.org/#puzzles' },
  readMore: { title: 'Wikipedia', license: 'CC BY-SA 4.0', url: 'https://en.wikipedia.org/' },
} as const;
