export const chess = {
  piece: {
    p: 'peão',
    n: 'cavalo',
    b: 'bispo',
    r: 'torre',
    q: 'dama',
    k: 'rei',
    any: 'peça',
  },
  threat: {
    mate: 'xeque-mate com {san}',
    check: 'xeque com {san}',
    capture: '{san}, ganhando material ({piece})',
    fork: '{san}, um garfo em {pieces}',
  },
  listSep: ', ',
  listAnd: ' e ',
};
