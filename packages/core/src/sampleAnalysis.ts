import type { GameAnalysis } from './review';

/**
 * Sample analysed game (the "Blackburne Shilling" trap) used by tests and the
 * coach demo screen. Evaluations are illustrative, not real engine output.
 */
export const SAMPLE_GAME_ANALYSIS: GameAnalysis = {
  version: 1,
  gameId: 'sample-shilling-trap',
  white: { name: 'You', rating: 1100 },
  black: { name: 'Opponent', rating: 1150 },
  result: '0-1',
  termination: 'checkmate',
  timeControl: '10+0',
  opening: { eco: 'C50', name: 'Italian Game: Blackburne Shilling Gambit' },
  engine: { name: 'sample' },
  moves:
[
  {
    "ply": 1,
    "san": "e4",
    "uci": "e2e4",
    "fenBefore": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "best": {
      "san": "e4",
      "uci": "e2e4",
      "line": [
        "e4",
        "e5",
        "Nf3"
      ],
      "score": {
        "cp": 30
      }
    },
    "scoreAfter": {
      "cp": 30
    },
    "legalMoveCount": 20,
    "book": true
  },
  {
    "ply": 2,
    "san": "e5",
    "uci": "e7e5",
    "fenBefore": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    "best": {
      "san": "e5",
      "uci": "e7e5",
      "line": [
        "e5",
        "Nf3",
        "Nc6"
      ],
      "score": {
        "cp": 30
      }
    },
    "scoreAfter": {
      "cp": 32
    },
    "legalMoveCount": 20,
    "book": true
  },
  {
    "ply": 3,
    "san": "Nf3",
    "uci": "g1f3",
    "fenBefore": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    "best": {
      "san": "Nf3",
      "uci": "g1f3",
      "line": [
        "Nf3",
        "Nc6",
        "Bb5"
      ],
      "score": {
        "cp": 32
      }
    },
    "scoreAfter": {
      "cp": 32
    },
    "legalMoveCount": 29,
    "book": true
  },
  {
    "ply": 4,
    "san": "Nc6",
    "uci": "b8c6",
    "fenBefore": "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    "best": {
      "san": "Nc6",
      "uci": "b8c6",
      "line": [
        "Nc6",
        "Bb5",
        "a6"
      ],
      "score": {
        "cp": 32
      }
    },
    "scoreAfter": {
      "cp": 35
    },
    "legalMoveCount": 29,
    "book": true
  },
  {
    "ply": 5,
    "san": "Bc4",
    "uci": "f1c4",
    "fenBefore": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    "best": {
      "san": "Bc4",
      "uci": "f1c4",
      "line": [
        "Bc4",
        "Nf6",
        "d3"
      ],
      "score": {
        "cp": 35
      }
    },
    "scoreAfter": {
      "cp": 35
    },
    "legalMoveCount": 27,
    "book": true
  },
  {
    "ply": 6,
    "san": "Nd4",
    "uci": "c6d4",
    "fenBefore": "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
    "best": {
      "san": "Nf6",
      "uci": "g8f6",
      "line": [
        "Nf6",
        "d3",
        "Bc5"
      ],
      "score": {
        "cp": 35
      }
    },
    "scoreAfter": {
      "cp": 95
    },
    "legalMoveCount": 31,
    "refutation": [
      "Nxd4",
      "exd4",
      "O-O"
    ]
  },
  {
    "ply": 7,
    "san": "Nxe5",
    "uci": "f3e5",
    "fenBefore": "r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    "best": {
      "san": "Nxd4",
      "uci": "f3d4",
      "line": [
        "Nxd4",
        "exd4",
        "O-O",
        "d6"
      ],
      "score": {
        "cp": 95
      }
    },
    "scoreAfter": {
      "cp": -120
    },
    "legalMoveCount": 31,
    "refutation": [
      "Qg5",
      "Nxf7",
      "Qxg2"
    ]
  },
  {
    "ply": 8,
    "san": "Qg5",
    "uci": "d8g5",
    "fenBefore": "r1bqkbnr/pppp1ppp/8/4N3/2BnP3/8/PPPP1PPP/RNBQK2R b KQkq - 0 4",
    "best": {
      "san": "Qg5",
      "uci": "d8g5",
      "line": [
        "Qg5",
        "Nxf7",
        "Qxg2",
        "Rf1"
      ],
      "score": {
        "cp": -120
      }
    },
    "scoreAfter": {
      "cp": -120
    },
    "legalMoveCount": 36
  },
  {
    "ply": 9,
    "san": "Nxf7",
    "uci": "e5f7",
    "fenBefore": "r1b1kbnr/pppp1ppp/8/4N1q1/2BnP3/8/PPPP1PPP/RNBQK2R w KQkq - 1 5",
    "best": {
      "san": "Bxf7+",
      "uci": "c4f7",
      "line": [
        "Bxf7+",
        "Ke7",
        "O-O",
        "Qxe5"
      ],
      "score": {
        "cp": -120
      }
    },
    "scoreAfter": {
      "mate": -3
    },
    "legalMoveCount": 38,
    "refutation": [
      "Qxg2",
      "Rf1",
      "Qxe4+",
      "Be2",
      "Nf3#"
    ]
  },
  {
    "ply": 10,
    "san": "Qxg2",
    "uci": "g5g2",
    "fenBefore": "r1b1kbnr/pppp1Npp/8/6q1/2BnP3/8/PPPP1PPP/RNBQK2R b KQkq - 0 5",
    "best": {
      "san": "Qxg2",
      "uci": "g5g2",
      "line": [
        "Qxg2",
        "Rf1",
        "Qxe4+",
        "Be2",
        "Nf3#"
      ],
      "score": {
        "mate": -3
      }
    },
    "scoreAfter": {
      "mate": -3
    },
    "legalMoveCount": 48
  },
  {
    "ply": 11,
    "san": "Rf1",
    "uci": "h1f1",
    "fenBefore": "r1b1kbnr/pppp1Npp/8/8/2BnP3/8/PPPP1PqP/RNBQK2R w KQkq - 0 6",
    "best": {
      "san": "Rf1",
      "uci": "h1f1",
      "line": [
        "Rf1",
        "Qxe4+",
        "Be2",
        "Nf3#"
      ],
      "score": {
        "mate": -3
      }
    },
    "scoreAfter": {
      "mate": -2
    },
    "legalMoveCount": 33
  },
  {
    "ply": 12,
    "san": "Qxe4+",
    "uci": "g2e4",
    "fenBefore": "r1b1kbnr/pppp1Npp/8/8/2BnP3/8/PPPP1PqP/RNBQKR2 b Qkq - 1 6",
    "best": {
      "san": "Qxe4+",
      "uci": "g2e4",
      "line": [
        "Qxe4+",
        "Be2",
        "Nf3#"
      ],
      "score": {
        "mate": -2
      }
    },
    "scoreAfter": {
      "mate": -2
    },
    "legalMoveCount": 42
  },
  {
    "ply": 13,
    "san": "Be2",
    "uci": "c4e2",
    "fenBefore": "r1b1kbnr/pppp1Npp/8/8/2Bnq3/8/PPPP1P1P/RNBQKR2 w Qkq - 0 7",
    "best": {
      "san": "Qe2",
      "uci": "d1e2",
      "line": [
        "Qe2",
        "Nxe2",
        "Nxh8"
      ],
      "score": {
        "mate": -2
      }
    },
    "scoreAfter": {
      "mate": -1
    },
    "legalMoveCount": 2
  },
  {
    "ply": 14,
    "san": "Nf3#",
    "uci": "d4f3",
    "fenBefore": "r1b1kbnr/pppp1Npp/8/8/3nq3/8/PPPPBP1P/RNBQKR2 b Qkq - 1 7",
    "best": {
      "san": "Nf3#",
      "uci": "d4f3",
      "line": [
        "Nf3#"
      ],
      "score": {
        "mate": -1
      }
    },
    "scoreAfter": {
      "mate": 0
    },
    "legalMoveCount": 48
  }
],
};
