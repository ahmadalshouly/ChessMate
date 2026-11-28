export const chess = {
  piece: {
    p: '兵',
    n: '马',
    b: '象',
    r: '车',
    q: '后',
    k: '王',
    any: '棋子',
  },
  threat: {
    mate: '用 {san} 将杀',
    check: '用 {san} 将军',
    capture: '{san}，吃掉{piece}',
    fork: '{san}，双击{pieces}',
  },
  listSep: '、',
  listAnd: '和',
};
