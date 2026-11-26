/** Sponsored spots: the label players see, the spot names, and the apply form. */
export const ads = {
  /** Shown above every sponsored spot, so an ad is recognisable as one. */
  sponsored: 'Sponsorisé',
  spot: {
    homeTop: 'Accueil, en haut',
    homeMid: 'Accueil, au milieu',
    homeEnd: 'Accueil, en bas',
    playLobby: 'Salon de jeu',
    gameStart: 'Début de partie',
    gameOver: 'Fin de partie',
    tournamentsList: 'Tournois',
    puzzlesHome: 'Accueil des problèmes',
    watchHome: 'Regarder',
    learnList: 'Apprendre',
  },
  apply: {
    spotLabel: 'Quel emplacement t’intéresse ?',
    spotAny: 'Pas de préférence',
    spotHint: 'On t’en proposera un si tu hésites.',
  },
} as const;
