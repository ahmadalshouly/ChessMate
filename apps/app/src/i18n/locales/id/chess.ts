export const chess = {
  piece: {
    p: 'pion',
    n: 'kuda',
    b: 'gajah',
    r: 'benteng',
    q: 'menteri',
    k: 'raja',
    any: 'buah',
  },
  threat: {
    mate: 'skakmat dengan {san}',
    check: 'skak dengan {san}',
    capture: '{san}, memenangkan {piece}',
    fork: '{san}, menyerang ganda {pieces}',
  },
  listSep: ', ',
  listAnd: ' dan ',
};
