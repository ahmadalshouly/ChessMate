export const chess = {
  piece: {
    p: 'pion',
    n: 'cavalier',
    b: 'fou',
    r: 'tour',
    q: 'dame',
    k: 'roi',
    any: 'pièce',
  },
  threat: {
    mate: 'échec et mat par {san}',
    check: 'échec par {san}',
    capture: '{san}, qui gagne une pièce ({piece})',
    fork: '{san}, fourchette sur {pieces}',
  },
  listSep: ', ',
  listAnd: ' et ',
};
