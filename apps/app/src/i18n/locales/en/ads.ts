/** Sponsored spots: the label players see, the spot names, and the apply form. */
export const ads = {
  /** Shown above every sponsored spot, so an ad is recognisable as one. */
  sponsored: 'Sponsored',
  spot: {
    'home.feed': 'Home feed',
    'play.lobby': 'Play lobby',
    'game.start': 'Game start',
    'game.over': 'Game over',
    'tournaments.list': 'Tournaments',
    'puzzles.home': 'Puzzles hub',
    'watch.home': 'Watch',
    'learn.list': 'Learn',
  },
  apply: {
    spotLabel: 'Which spot interests you?',
    spotAny: 'No preference',
    spotHint: 'We will suggest one if you are not sure.',
  },
} as const;
