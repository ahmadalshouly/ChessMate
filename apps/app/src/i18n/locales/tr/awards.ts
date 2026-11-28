export const awards = {
  title: 'Ödüller',
  titleOf: 'Ödüller · {name}',
  collection: 'Koleksiyon',
  levelsCount: '{total} seviyeden {earned} tanesi',
  recent: 'Son ödüller',
  seeAll: 'Tümünü gör',
  locked: 'Henüz kazanılmadı',
  maxed: 'Tüm seviyeler kazanıldı',
  progress: '{value} / {next}',
  value: 'Şu ana kadar {value}',
  levels: 'Seviyeler',
  earnedOn: '{date} tarihinde kazanıldı',
  countriesTitle: 'Ülkeler',
  none: 'Henüz ödül yok. İlkini kazanmak için oyun oyna.',
  noneOf: '{name} henüz hiç ödül kazanmadı.',
  signIn: 'Oyunlarından ödül toplamak için giriş yap.',
  loadFailed: 'Ödüller yüklenemedi: {reason}',
  unlocked: 'Ödül açıldı',
  unlockedMany: {
    one: '{count} ödül açıldı',
    other: '{count} ödül açıldı',
  },
  view: 'Görüntüle',
  andMore: {
    one: 've {count} tane daha',
    other: 've {count} tane daha',
  },
  filters: {
    all: 'Tümü',
    earned: 'Kazanılan',
    openings: 'Açılışlar',
    ratings: 'Puanlar',
    countries: 'Ülkeler',
    checkmates: 'Şah matlar',
    milestones: 'Kilometre taşları',
  },
  tiers: {
    bronze: 'Bronz',
    silver: 'Gümüş',
    gold: 'Altın',
    platinum: 'Platin',
    diamond: 'Elmas',
  },
  items: {
    opening: {
      desc: {
        one: '{opening} ile {count} oyun kazan',
        other: '{opening} ile {count} oyun kazan',
      },
    },
    rating: {
      name: '{category} puanı',
      desc: {
        one: '{category} puanında {count} seviyesine ulaş',
        other: '{category} puanında {count} seviyesine ulaş',
      },
    },
    explorer: {
      name: 'Açılış kâşifi',
      desc: {
        one: '{count} farklı açılış oyna',
        other: '{count} farklı açılış oyna',
      },
    },
    countriesPlayed: {
      name: 'Dünya gezgini',
      desc: {
        one: '{count} ülkeden rakiplerle oyna',
        other: '{count} farklı ülkeden rakiplerle oyna',
      },
    },
    countriesBeaten: {
      name: 'Dünya fatihi',
      desc: {
        one: '{count} ülkeden rakipleri yen',
        other: '{count} farklı ülkeden rakipleri yen',
      },
    },
    matesTotal: {
      name: 'Şah mat sanatçısı',
      desc: {
        one: '{count} kez şah mat yap',
        other: '{count} kez şah mat yap',
      },
    },
    gamesPlayed: {
      name: 'Azimli',
      desc: {
        one: '{count} oyun oyna',
        other: '{count} oyun oyna',
      },
    },
    gamesWon: {
      name: 'Kazanan',
      desc: {
        one: '{count} oyun kazan',
        other: '{count} oyun kazan',
      },
    },
  },
  mates: {
    backRank: {
      name: 'Arka sıra matı',
      desc: {
        one: 'Arka sırasında sıkışmış bir şahı bir kez mat et',
        other: 'Arka sırasında sıkışmış bir şahı {count} kez mat et',
      },
    },
    smothered: {
      name: 'Boğmaca mat',
      desc: {
        one: 'Kendi taşlarıyla çevrili bir şahı atla bir kez mat et',
        other: 'Kendi taşlarıyla çevrili bir şahı atla {count} kez mat et',
      },
    },
    doubleCheck: {
      name: 'Çifte şah matı',
      desc: {
        one: 'Aynı anda şah çeken iki taşla bir kez mat et',
        other: 'Aynı anda şah çeken iki taşla {count} kez mat et',
      },
    },
    discovered: {
      name: 'Açarak mat',
      desc: {
        one: 'Bir taşı yoldan çekerek bir kez mat et',
        other: 'Bir taşı yoldan çekerek {count} kez mat et',
      },
    },
    castling: {
      name: 'Rok ile mat',
      desc: {
        one: 'Rok yaparak bir kez mat et',
        other: 'Rok yaparak {count} kez mat et',
      },
    },
    enPassant: {
      name: 'Geçerken alma ile mat',
      desc: {
        one: 'Geçerken alarak bir kez mat et',
        other: 'Geçerken alarak {count} kez mat et',
      },
    },
    promotion: {
      name: 'Terfi ile mat',
      desc: {
        one: 'Vezire terfi ederek bir kez mat et',
        other: 'Vezire terfi ederek {count} kez mat et',
      },
    },
    underpromotion: {
      name: 'Alt terfi ile mat',
      desc: {
        one: 'Kale, fil veya ata terfi ederek bir kez mat et',
        other: 'Kale, fil veya ata terfi ederek {count} kez mat et',
      },
    },
    pawn: {
      name: 'Piyon matı',
      desc: {
        one: 'Piyonla bir kez mat et',
        other: 'Piyonla {count} kez mat et',
      },
    },
    knight: {
      name: 'At matı',
      desc: {
        one: 'Atla bir kez mat et',
        other: 'Atla {count} kez mat et',
      },
    },
    bishop: {
      name: 'Fil matı',
      desc: {
        one: 'Fille bir kez mat et',
        other: 'Fille {count} kez mat et',
      },
    },
    rook: {
      name: 'Kale matı',
      desc: {
        one: 'Kaleyle bir kez mat et',
        other: 'Kaleyle {count} kez mat et',
      },
    },
    queen: {
      name: 'Vezir matı',
      desc: {
        one: 'Vezirinle bir kez mat et',
        other: 'Vezirinle {count} kez mat et',
      },
    },
    king: {
      name: 'Şah hamlesiyle mat',
      desc: {
        one: 'Şahını oynayarak bir kez mat et',
        other: 'Şahını oynayarak {count} kez mat et',
      },
    },
    quick: {
      name: 'Yıldırım mat',
      desc: {
        one: '15 hamle içinde bir kez mat et',
        other: '15 hamle içinde {count} kez mat et',
      },
    },
  },
  openings: {
    sicilian: 'Sicilya Savunması',
    ruyLopez: 'Ruy Lopez',
    italian: 'İtalyan Oyunu',
    french: 'Fransız Savunması',
    caroKann: 'Caro-Kann Savunması',
    queensGambit: 'Vezir Gambiti',
    slav: 'Slav Savunması',
    kingsIndian: 'Şah Hint Savunması',
    nimzoIndian: 'Nimzo-Hint Savunması',
    grunfeld: 'Grünfeld Savunması',
    english: 'İngiliz Açılışı',
    london: 'Londra Sistemi',
    kingsGambit: 'Şah Gambiti',
    scotch: 'İskoç Oyunu',
    vienna: 'Viyana Oyunu',
    scandinavian: 'İskandinav Savunması',
    pirc: 'Pirc ve Modern Savunma',
    dutch: 'Hollanda Savunması',
    catalan: 'Katalan Açılışı',
    petrov: 'Petrov Savunması',
    alekhine: 'Alekhine Savunması',
    benoni: 'Benoni Savunması',
  },
};
