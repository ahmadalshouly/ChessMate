/** Sponsored spots: the label players see, the spot names, and the apply form. */
export const ads = {
  /** Shown above every sponsored spot, so an ad is recognisable as one. */
  sponsored: 'スポンサー',
  spot: {
    homeTop: 'ホーム上部',
    homeMid: 'ホーム中部',
    homeEnd: 'ホーム下部',
    playLobby: '対局ロビー',
    gameStart: '対局開始時',
    gameOver: '対局終了時',
    tournamentsList: 'トーナメント',
    puzzlesHome: 'パズルハブ',
    watchHome: '観戦',
    learnList: '学ぶ',
  },
  apply: {
    spotLabel: 'ご希望の掲載枠はどれですか？',
    spotAny: '希望なし',
    spotHint: '迷っている場合はこちらからご提案します。',
  },
} as const;
