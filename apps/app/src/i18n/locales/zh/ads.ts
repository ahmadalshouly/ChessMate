/** Sponsored spots: the label players see, the spot names, and the apply form. */
export const ads = {
  /** Shown above every sponsored spot, so an ad is recognisable as one. */
  sponsored: 'Sponsored',
  spot: {
    homeTop: 'Home top',
    homeMid: 'Home middle',
    homeEnd: 'Home bottom',
    playLobby: 'Play lobby',
    gameStart: 'Game start',
    gameOver: 'Game over',
    tournamentsList: 'Tournaments',
    puzzlesHome: 'Puzzles hub',
    watchHome: 'Watch',
    learnList: 'Learn',
  },
  apply: {
    spotLabel: 'Which spot interests you?',
    spotAny: 'No preference',
    spotHint: 'We will suggest one if you are not sure.',
  },
} as const;
