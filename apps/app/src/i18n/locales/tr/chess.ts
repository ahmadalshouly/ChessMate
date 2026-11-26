export const chess = {
  piece: {
    p: 'piyon',
    n: 'at',
    b: 'fil',
    r: 'kale',
    q: 'vezir',
    k: 'şah',
    any: 'taş',
  },
  threat: {
    mate: '{san} ile şah mat',
    check: '{san} ile şah',
    capture: '{san} ile {piece} kazanmak',
    fork: '{san} ile çatal: {pieces}',
  },
  listSep: ', ',
  listAnd: ' ve ',
};
