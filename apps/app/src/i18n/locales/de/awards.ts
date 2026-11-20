export const awards = {
  title: 'Auszeichnungen',
  titleOf: 'Auszeichnungen von {name}',
  collection: 'Sammlung',
  levelsCount: '{earned} von {total} Stufen',
  recent: 'Neueste Auszeichnungen',
  seeAll: 'Alle ansehen',
  locked: 'Noch nicht erreicht',
  maxed: 'Alle Stufen erreicht',
  progress: '{value} / {next}',
  value: 'Bisher {value}',
  levels: 'Stufen',
  earnedOn: 'Erreicht am {date}',
  countriesTitle: 'Länder',
  none: 'Noch keine Auszeichnungen. Spiel Partien, um deine erste zu verdienen.',
  noneOf: '{name} hat noch keine Auszeichnungen.',
  signIn: 'Melde dich an, um mit deinen Partien Auszeichnungen zu sammeln.',
  loadFailed: 'Auszeichnungen konnten nicht geladen werden: {reason}',
  unlocked: 'Auszeichnung freigeschaltet',
  unlockedMany: {
    one: '{count} Auszeichnung freigeschaltet',
    other: '{count} Auszeichnungen freigeschaltet',
  },
  view: 'Ansehen',
  filters: {
    all: 'Alle',
    earned: 'Erreicht',
    openings: 'Eröffnungen',
    ratings: 'Wertungen',
    countries: 'Länder',
    checkmates: 'Mattbilder',
    milestones: 'Meilensteine',
  },
  tiers: {
    bronze: 'Bronze',
    silver: 'Silber',
    gold: 'Gold',
    platinum: 'Platin',
    diamond: 'Diamant',
  },
  items: {
    opening: {
      desc: {
        one: 'Gewinne {count} Partie mit dieser Eröffnung: {opening}',
        other: 'Gewinne {count} Partien mit dieser Eröffnung: {opening}',
      },
    },
    rating: {
      name: '{category}-Wertung',
      desc: {
        one: 'Erreiche eine {category}-Wertung von {count}',
        other: 'Erreiche eine {category}-Wertung von {count}',
      },
    },
    explorer: {
      name: 'Eröffnungsentdecker',
      desc: {
        one: 'Spiele {count} verschiedene Eröffnung',
        other: 'Spiele {count} verschiedene Eröffnungen',
      },
    },
    countriesPlayed: {
      name: 'Weltenbummler',
      desc: {
        one: 'Spiele gegen Gegner aus {count} Land',
        other: 'Spiele gegen Gegner aus {count} Ländern',
      },
    },
    countriesBeaten: {
      name: 'Welteroberer',
      desc: {
        one: 'Besiege Gegner aus {count} Land',
        other: 'Besiege Gegner aus {count} Ländern',
      },
    },
    matesTotal: {
      name: 'Mattkünstler',
      desc: {
        one: 'Setze {count}-mal matt',
        other: 'Setze {count}-mal matt',
      },
    },
    gamesPlayed: {
      name: 'Ausdauernd',
      desc: {
        one: 'Spiele {count} Partie',
        other: 'Spiele {count} Partien',
      },
    },
    gamesWon: {
      name: 'Sieger',
      desc: {
        one: 'Gewinne {count} Partie',
        other: 'Gewinne {count} Partien',
      },
    },
  },
  mates: {
    backRank: {
      name: 'Grundreihenmatt',
      desc: {
        one: 'Setze einen König auf seiner Grundreihe matt (einmal)',
        other: 'Setze einen König auf seiner Grundreihe matt ({count}-mal)',
      },
    },
    smothered: {
      name: 'Ersticktes Matt',
      desc: {
        one: 'Setze mit einem Springer einen von eigenen Figuren eingesperrten König matt (einmal)',
        other: 'Setze mit einem Springer einen von eigenen Figuren eingesperrten König matt ({count}-mal)',
      },
    },
    doubleCheck: {
      name: 'Doppelschachmatt',
      desc: {
        one: 'Setze mit zwei Figuren gleichzeitig matt (einmal)',
        other: 'Setze mit zwei Figuren gleichzeitig matt ({count}-mal)',
      },
    },
    discovered: {
      name: 'Abzugsmatt',
      desc: {
        one: 'Setze matt, indem du eine Figur aus dem Weg ziehst (einmal)',
        other: 'Setze matt, indem du eine Figur aus dem Weg ziehst ({count}-mal)',
      },
    },
    castling: {
      name: 'Rochadematt',
      desc: {
        one: 'Setze mit der Rochade matt (einmal)',
        other: 'Setze mit der Rochade matt ({count}-mal)',
      },
    },
    enPassant: {
      name: 'En-passant-Matt',
      desc: {
        one: 'Setze mit einem En-passant-Schlag matt (einmal)',
        other: 'Setze mit einem En-passant-Schlag matt ({count}-mal)',
      },
    },
    promotion: {
      name: 'Umwandlungsmatt',
      desc: {
        one: 'Setze mit einer Umwandlung in eine Dame matt (einmal)',
        other: 'Setze mit einer Umwandlung in eine Dame matt ({count}-mal)',
      },
    },
    underpromotion: {
      name: 'Unterverwandlungsmatt',
      desc: {
        one: 'Setze mit einer Umwandlung in Turm, Läufer oder Springer matt (einmal)',
        other: 'Setze mit einer Umwandlung in Turm, Läufer oder Springer matt ({count}-mal)',
      },
    },
    pawn: {
      name: 'Bauernmatt',
      desc: {
        one: 'Setze mit einem Bauern matt (einmal)',
        other: 'Setze mit einem Bauern matt ({count}-mal)',
      },
    },
    knight: {
      name: 'Springermatt',
      desc: {
        one: 'Setze mit einem Springer matt (einmal)',
        other: 'Setze mit einem Springer matt ({count}-mal)',
      },
    },
    bishop: {
      name: 'Läufermatt',
      desc: {
        one: 'Setze mit einem Läufer matt (einmal)',
        other: 'Setze mit einem Läufer matt ({count}-mal)',
      },
    },
    rook: {
      name: 'Turmmatt',
      desc: {
        one: 'Setze mit einem Turm matt (einmal)',
        other: 'Setze mit einem Turm matt ({count}-mal)',
      },
    },
    queen: {
      name: 'Damenmatt',
      desc: {
        one: 'Setze mit deiner Dame matt (einmal)',
        other: 'Setze mit deiner Dame matt ({count}-mal)',
      },
    },
    king: {
      name: 'Königsmatt',
      desc: {
        one: 'Setze matt, indem du deinen König ziehst (einmal)',
        other: 'Setze matt, indem du deinen König ziehst ({count}-mal)',
      },
    },
    quick: {
      name: 'Blitzmatt',
      desc: {
        one: 'Setze innerhalb von 15 Zügen matt (einmal)',
        other: 'Setze innerhalb von 15 Zügen matt ({count}-mal)',
      },
    },
  },
  openings: {
    sicilian: 'Sizilianische Verteidigung',
    ruyLopez: 'Spanische Partie',
    italian: 'Italienische Partie',
    french: 'Französische Verteidigung',
    caroKann: 'Caro-Kann-Verteidigung',
    queensGambit: 'Damengambit',
    slav: 'Slawische Verteidigung',
    kingsIndian: 'Königsindische Verteidigung',
    nimzoIndian: 'Nimzowitsch-Indische Verteidigung',
    grunfeld: 'Grünfeld-Indische Verteidigung',
    english: 'Englische Eröffnung',
    london: 'Londoner System',
    kingsGambit: 'Königsgambit',
    scotch: 'Schottische Partie',
    vienna: 'Wiener Partie',
    scandinavian: 'Skandinavische Verteidigung',
    pirc: 'Pirc- und Moderne Verteidigung',
    dutch: 'Holländische Verteidigung',
    catalan: 'Katalanische Eröffnung',
    petrov: 'Russische Verteidigung',
    alekhine: 'Aljechin-Verteidigung',
    benoni: 'Benoni-Verteidigung',
  },
};
