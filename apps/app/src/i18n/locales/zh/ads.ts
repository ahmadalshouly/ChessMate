/** Sponsored spots: the label players see, the spot names, and the apply form. */
export const ads = {
  /** Shown above every sponsored spot, so an ad is recognisable as one. */
  sponsored: '赞助',
  spot: {
    homeTop: '首页顶部',
    homeMid: '首页中部',
    homeEnd: '首页底部',
    playLobby: '对局大厅',
    gameStart: '对局开始',
    gameOver: '对局结束',
    tournamentsList: '锦标赛',
    puzzlesHome: '谜题中心',
    watchHome: '观战',
    learnList: '学习',
  },
  apply: {
    spotLabel: '你对哪个位置感兴趣？',
    spotAny: '无偏好',
    spotHint: '如果你不确定，我们会为你推荐一个。',
  },
} as const;
