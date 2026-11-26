export const awards = {
  title: 'Récompenses',
  titleOf: 'Récompenses de {name}',
  collection: 'Collection',
  levelsCount: '{earned} niveaux sur {total}',
  recent: 'Récompenses récentes',
  seeAll: 'Tout voir',
  locked: 'Pas encore obtenue',
  maxed: 'Tous les niveaux obtenus',
  progress: '{value} / {next}',
  value: '{value} pour l’instant',
  levels: 'Niveaux',
  earnedOn: 'Obtenue {date}',
  countriesTitle: 'Pays',
  none: 'Aucune récompense pour l’instant. Joue des parties pour obtenir la première.',
  noneOf: '{name} n’a encore aucune récompense.',
  signIn: 'Connecte-toi pour collectionner des récompenses avec tes parties.',
  loadFailed: 'Impossible de charger les récompenses : {reason}',
  unlocked: 'Récompense débloquée',
  unlockedMany: {
    one: '{count} récompense débloquée',
    other: '{count} récompenses débloquées',
  },
  view: 'Voir',
  andMore: {
    one: 'et {count} autre',
    other: 'et {count} autres',
  },
  filters: {
    all: 'Toutes',
    earned: 'Obtenues',
    openings: 'Ouvertures',
    ratings: 'Classements',
    countries: 'Pays',
    checkmates: 'Échecs et mats',
    milestones: 'Étapes',
  },
  tiers: {
    bronze: 'Bronze',
    silver: 'Argent',
    gold: 'Or',
    platinum: 'Platine',
    diamond: 'Diamant',
  },
  items: {
    opening: {
      desc: {
        one: 'Gagne {count} partie avec l’ouverture {opening}',
        other: 'Gagne {count} parties avec l’ouverture {opening}',
      },
    },
    rating: {
      name: 'Elo {category}',
      desc: {
        one: 'Atteins un Elo de {count} en {category}',
        other: 'Atteins un Elo de {count} en {category}',
      },
    },
    explorer: {
      name: 'Explorateur d’ouvertures',
      desc: {
        one: 'Joue {count} ouverture différente',
        other: 'Joue {count} ouvertures différentes',
      },
    },
    countriesPlayed: {
      name: 'Globe-trotteur',
      desc: {
        one: 'Affronte des adversaires de {count} pays',
        other: 'Affronte des adversaires de {count} pays',
      },
    },
    countriesBeaten: {
      name: 'Conquérant du monde',
      desc: {
        one: 'Bats des adversaires de {count} pays',
        other: 'Bats des adversaires de {count} pays',
      },
    },
    matesTotal: {
      name: 'Artiste du mat',
      desc: {
        one: 'Donne {count} échec et mat',
        other: 'Donne {count} échecs et mats',
      },
    },
    gamesPlayed: {
      name: 'Assidu',
      desc: {
        one: 'Joue {count} partie',
        other: 'Joue {count} parties',
      },
    },
    gamesWon: {
      name: 'Gagnant',
      desc: {
        one: 'Gagne {count} partie',
        other: 'Gagne {count} parties',
      },
    },
  },
  mates: {
    backRank: {
      name: 'Mat du couloir',
      desc: {
        one: 'Mate une fois un roi bloqué sur sa dernière rangée',
        other: 'Mate {count} fois un roi bloqué sur sa dernière rangée',
      },
    },
    smothered: {
      name: 'Mat étouffé',
      desc: {
        one: 'Mate une fois avec un cavalier un roi enfermé par ses propres pièces',
        other: 'Mate {count} fois avec un cavalier un roi enfermé par ses propres pièces',
      },
    },
    doubleCheck: {
      name: 'Mat par échec double',
      desc: {
        one: 'Mate une fois avec deux pièces donnant échec en même temps',
        other: 'Mate {count} fois avec deux pièces donnant échec en même temps',
      },
    },
    discovered: {
      name: 'Mat à la découverte',
      desc: {
        one: 'Mate une fois en déplaçant une pièce qui bloquait',
        other: 'Mate {count} fois en déplaçant une pièce qui bloquait',
      },
    },
    castling: {
      name: 'Mat par roque',
      desc: {
        one: 'Mate une fois en roquant',
        other: 'Mate {count} fois en roquant',
      },
    },
    enPassant: {
      name: 'Mat en passant',
      desc: {
        one: 'Mate une fois en prenant en passant',
        other: 'Mate {count} fois en prenant en passant',
      },
    },
    promotion: {
      name: 'Mat par promotion',
      desc: {
        one: 'Mate une fois en promouvant en dame',
        other: 'Mate {count} fois en promouvant en dame',
      },
    },
    underpromotion: {
      name: 'Mat par sous-promotion',
      desc: {
        one: 'Mate une fois en promouvant en tour, fou ou cavalier',
        other: 'Mate {count} fois en promouvant en tour, fou ou cavalier',
      },
    },
    pawn: {
      name: 'Mat du pion',
      desc: {
        one: 'Mate une fois avec un pion',
        other: 'Mate {count} fois avec un pion',
      },
    },
    knight: {
      name: 'Mat du cavalier',
      desc: {
        one: 'Mate une fois avec un cavalier',
        other: 'Mate {count} fois avec un cavalier',
      },
    },
    bishop: {
      name: 'Mat du fou',
      desc: {
        one: 'Mate une fois avec un fou',
        other: 'Mate {count} fois avec un fou',
      },
    },
    rook: {
      name: 'Mat de la tour',
      desc: {
        one: 'Mate une fois avec une tour',
        other: 'Mate {count} fois avec une tour',
      },
    },
    queen: {
      name: 'Mat de la dame',
      desc: {
        one: 'Mate une fois avec ta dame',
        other: 'Mate {count} fois avec ta dame',
      },
    },
    king: {
      name: 'Mat du roi',
      desc: {
        one: 'Mate une fois en déplaçant ton roi',
        other: 'Mate {count} fois en déplaçant ton roi',
      },
    },
    quick: {
      name: 'Mat éclair',
      desc: {
        one: 'Mate une fois en 15 coups ou moins',
        other: 'Mate {count} fois en 15 coups ou moins',
      },
    },
  },
  openings: {
    sicilian: 'Défense sicilienne',
    ruyLopez: 'Partie espagnole',
    italian: 'Partie italienne',
    french: 'Défense française',
    caroKann: 'Défense Caro-Kann',
    queensGambit: 'Gambit dame',
    slav: 'Défense slave',
    kingsIndian: 'Défense est-indienne',
    nimzoIndian: 'Défense nimzo-indienne',
    grunfeld: 'Défense Grünfeld',
    english: 'Ouverture anglaise',
    london: 'Système de Londres',
    kingsGambit: 'Gambit du roi',
    scotch: 'Partie écossaise',
    vienna: 'Partie viennoise',
    scandinavian: 'Défense scandinave',
    pirc: 'Défense Pirc et moderne',
    dutch: 'Défense hollandaise',
    catalan: 'Ouverture catalane',
    petrov: 'Défense Petrov',
    alekhine: 'Défense Alekhine',
    benoni: 'Défense Benoni',
  },
};
