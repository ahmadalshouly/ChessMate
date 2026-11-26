/** Sponsored spots: the label players see, the spot names, and the apply form. */
export const ads = {
  /** Shown above every sponsored spot, so an ad is recognisable as one. */
  sponsored: 'Bersponsor',
  spot: {
    homeTop: 'Beranda atas',
    homeMid: 'Beranda tengah',
    homeEnd: 'Beranda bawah',
    playLobby: 'Lobi main',
    gameStart: 'Awal permainan',
    gameOver: 'Akhir permainan',
    tournamentsList: 'Turnamen',
    puzzlesHome: 'Pusat teka-teki',
    watchHome: 'Tonton',
    learnList: 'Belajar',
  },
  apply: {
    spotLabel: 'Tempat mana yang kamu minati?',
    spotAny: 'Tidak ada preferensi',
    spotHint: 'Kami akan menyarankan satu jika kamu belum yakin.',
  },
} as const;
