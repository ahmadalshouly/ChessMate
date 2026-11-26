export const chess = {
  piece: {
    p: 'ポーン',
    n: 'ナイト',
    b: 'ビショップ',
    r: 'ルーク',
    q: 'クイーン',
    k: 'キング',
    any: '駒',
  },
  threat: {
    mate: '{san}でのチェックメイト',
    check: '{san}でのチェック',
    capture: '{san}で{piece}を取る手',
    fork: '{san}で{pieces}をフォークする手',
  },
  listSep: '、',
  listAnd: 'と',
};
