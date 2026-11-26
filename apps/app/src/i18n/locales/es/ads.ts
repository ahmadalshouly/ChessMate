/** Sponsored spots: the label players see, the spot names, and the apply form. */
export const ads = {
  /** Shown above every sponsored spot, so an ad is recognisable as one. */
  sponsored: 'Patrocinado',
  spot: {
    homeTop: 'Inicio arriba',
    homeMid: 'Inicio en medio',
    homeEnd: 'Inicio abajo',
    playLobby: 'Sala de juego',
    gameStart: 'Inicio de partida',
    gameOver: 'Fin de partida',
    tournamentsList: 'Torneos',
    puzzlesHome: 'Portada de problemas',
    watchHome: 'Ver',
    learnList: 'Aprender',
  },
  apply: {
    spotLabel: '¿Qué espacio te interesa?',
    spotAny: 'Sin preferencia',
    spotHint: 'Te sugeriremos uno si no lo tienes claro.',
  },
} as const;
