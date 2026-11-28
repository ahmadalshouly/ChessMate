export const secretQueen = {
  name: '秘密皇后',
  game: '玩法',
  standard: '标准',
  standardHint: '常规国际象棋。',
  rules: '在走第一步之前秘密选择一个兵，选定后不可更改。它可以像后一样走，但这样会暴露身份；它将军时也会暴露。始终为友谊赛，不与普通对局混合匹配。',
  casualOnly: '秘密皇后对局始终为友谊赛。',
  pick: '选择你的秘密皇后：点按一个高亮的兵。之后无法更改。',
  chosen: '你的秘密皇后是 {square} 上的兵。已锁定，对手并不知道。',
  revealed: {
    moved: '{side}在 {square} 的秘密皇后像后一样走了一步，身份已暴露。',
    check: '{side}在 {square} 的秘密皇后将军了，身份已暴露。',
    blocked: '这步棋无法走：{side}在 {square} 的秘密皇后控制着它。现在它的身份已暴露。',
    captured: '在 {square} 被吃掉的兵是{side}的秘密皇后。',
    end: '{side}的秘密皇后在 {square}。',
  },
};
