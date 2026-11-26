export const chess = {
  piece: {
    p: 'peón',
    n: 'caballo',
    b: 'alfil',
    r: 'torre',
    q: 'dama',
    k: 'rey',
    any: 'pieza',
  },
  threat: {
    mate: 'jaque mate con {san}',
    check: 'jaque con {san}',
    capture: '{san}, ganando material ({piece})',
    fork: '{san}, con doble ataque a {pieces}',
  },
  listSep: ', ',
  listAnd: ' y ',
};
