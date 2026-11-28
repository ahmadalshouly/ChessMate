export const chess = {
  piece: {
    p: 'пешка',
    n: 'конь',
    b: 'слон',
    r: 'ладья',
    q: 'ферзь',
    k: 'король',
    any: 'фигура',
  },
  threat: {
    mate: 'мат ходом {san}',
    check: 'шах ходом {san}',
    capture: '{san} с выигрышем фигуры ({piece})',
    fork: '{san} — вилка: {pieces}',
  },
  listSep: ', ',
  listAnd: ' и ',
};
