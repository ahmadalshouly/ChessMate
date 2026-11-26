/** Sponsored spots: the label players see, the spot names, and the apply form. */
export const ads = {
  /** Shown above every sponsored spot, so an ad is recognisable as one. */
  sponsored: 'Реклама',
  spot: {
    homeTop: 'Главная, вверху',
    homeMid: 'Главная, в середине',
    homeEnd: 'Главная, внизу',
    playLobby: 'Лобби игры',
    gameStart: 'Начало партии',
    gameOver: 'Конец партии',
    tournamentsList: 'Турниры',
    puzzlesHome: 'Раздел задач',
    watchHome: 'Смотреть',
    learnList: 'Обучение',
  },
  apply: {
    spotLabel: 'Какое место тебя интересует?',
    spotAny: 'Без разницы',
    spotHint: 'Если не уверен, мы предложим вариант.',
  },
} as const;
