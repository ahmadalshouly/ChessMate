export const chess = {
  piece: {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
    any: 'piece',
  },
  threat: {
    mate: 'checkmate with {san}',
    check: 'check with {san}',
    capture: '{san}, winning the {piece}',
    fork: '{san}, forking {pieces}',
  },
  listSep: ', ',
  listAnd: ' and ',
};
