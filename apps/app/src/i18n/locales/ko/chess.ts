export const chess = {
  piece: {
    p: '폰',
    n: '나이트',
    b: '비숍',
    r: '룩',
    q: '퀸',
    k: '킹',
    any: '기물',
  },
  threat: {
    mate: '{san}으로 체크메이트',
    check: '{san}으로 체크',
    capture: '{san}, {piece} 획득',
    fork: '{san}, {pieces} 포크',
  },
  listSep: ', ',
  listAnd: ' 및 ',
};
