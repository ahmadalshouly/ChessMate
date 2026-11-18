import type { Messages } from '../../core';
import type { secretQueen as en } from '../en/secretQueen';

export const secretQueen: Messages<typeof en> = {
  name: 'Geheime Dame',
  standard: 'Standard',
  variant: 'Variante',
  variantHint: 'Geheime Dame: Einer deiner Bauern ist heimlich eine Dame. Immer ungewertet.',
  lobbyTag: 'Geheime Dame',
  pickTitle: 'Wähle deine geheime Dame',
  pickBody: 'Tippe auf einen deiner Bauern. Er zieht wie eine Dame, aber dein Gegner sieht einen Bauern, bis sie sich zeigen muss.',
  oppPicking: 'Dein Gegner wählt seine geheime Dame.',
  yours: 'Deine geheime Dame steht auf {square}. Nur du siehst die Krone.',
  revealed: {
    moved: '{queen} ist aufgedeckt: Sie zog von {square} wie eine Dame.',
    promoted: '{queen} erreichte die letzte Reihe und ist aufgedeckt.',
    check: '{queen} auf {square} gibt Schach.',
    blocked: '{queen} auf {square} hat diesen Zug verhindert.',
    captured: 'Der auf {square} geschlagene Bauer war {queenLower}.',
    gameEnd: '{queen} stand auf {square}.',
  },
  sideYour: 'Deine geheime Dame',
  sideTheir: 'Die geheime Dame deines Gegners',
  sideWhite: 'Die geheime Dame von Weiß',
  sideBlack: 'Die geheime Dame von Schwarz',
  sideYourLower: 'deine geheime Dame',
  sideTheirLower: 'die geheime Dame deines Gegners',
  sideWhiteLower: 'die geheime Dame von Weiß',
  sideBlackLower: 'die geheime Dame von Schwarz',
  rulesTitle: 'So funktioniert Geheime Dame',
  rules: 'Wähle vor deinem ersten Zug einen Bauern. Er ist eine verkleidete Dame: Er kann wie ein Bauer ziehen und verborgen bleiben, oder wie eine Dame ziehen und aufgedeckt werden. Aufgedeckt wird sie auch, wenn sie Schach gibt, die letzte Reihe erreicht, geschlagen wird oder einen Zug deines Gegners verhindert.',
  noReview: 'Partien mit Geheimer Dame werden noch nicht im Verlauf gespeichert oder analysiert.',
};
