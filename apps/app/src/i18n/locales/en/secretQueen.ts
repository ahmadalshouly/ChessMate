export const secretQueen = {
  name: 'Secret Queen',
  game: 'Game',
  standard: 'Standard',
  standardHint: 'Regular chess.',
  rules: 'Pick one pawn in secret before your first move. It can move like a queen; doing so reveals it. It also shows itself when it gives check. Always casual.',
  casualOnly: 'Secret Queen games are always casual.',
  pick: 'Tap one of your pawns to make it your secret queen.',
  chosen: 'Your secret queen is the pawn on {square}. Your opponent does not know.',
  change: 'Change',
  revealed: {
    moved: '{side}’s secret queen on {square} moved like a queen and is revealed.',
    check: '{side}’s secret queen on {square} gave check and is revealed.',
    blocked: 'That move was not possible: {side}’s secret queen on {square} covers it. It is revealed now.',
    captured: 'The pawn taken on {square} was {side}’s secret queen.',
    end: '{side}’s secret queen was on {square}.',
  },
};
