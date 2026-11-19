export const secretQueen = {
  name: 'Secret Queen',
  game: 'Game',
  standard: 'Standard',
  standardHint: 'Regular chess.',
  rules: 'Pick one pawn in secret before your first move; the choice is final. It can move like a queen, which reveals it, and it shows itself when it gives check. Always casual, never mixed with normal games.',
  casualOnly: 'Secret Queen games are always casual.',
  pick: 'Choose your secret queen: tap one of the highlighted pawns. You cannot change it later.',
  chosen: 'Your secret queen is the pawn on {square}. It is locked in, and your opponent does not know.',
  revealed: {
    moved: '{side}’s secret queen on {square} moved like a queen and is revealed.',
    check: '{side}’s secret queen on {square} gave check and is revealed.',
    blocked: 'That move was not possible: {side}’s secret queen on {square} covers it. It is revealed now.',
    captured: 'The pawn taken on {square} was {side}’s secret queen.',
    end: '{side}’s secret queen was on {square}.',
  },
};
