import type { Messages } from '../../core';
import type { secretQueen as en } from '../en/secretQueen';

export const secretQueen: Messages<typeof en> = {
  name: 'Geheime Dame',
  game: 'Partie',
  standard: 'Standard',
  standardHint: 'Normales Schach.',
  rules: 'Wähle vor deinem ersten Zug heimlich einen Bauern; die Wahl ist endgültig. Er kann wie eine Dame ziehen, dann wird er aufgedeckt, und er zeigt sich, wenn er Schach gibt. Immer ungewertet, nie mit normalen Partien gemischt.',
  casualOnly: 'Partien mit geheimer Dame sind immer ungewertet.',
  pick: 'Wähle deine geheime Dame: Tippe auf einen der markierten Bauern. Später kannst du sie nicht mehr ändern.',
  chosen: 'Deine geheime Dame ist der Bauer auf {square}. Sie steht fest, und dein Gegner weiß es nicht.',
  revealed: {
    moved: 'Die geheime Dame von {side} auf {square} zog wie eine Dame und ist aufgedeckt.',
    check: 'Die geheime Dame von {side} auf {square} gab Schach und ist aufgedeckt.',
    blocked: 'Dieser Zug ging nicht: Die geheime Dame von {side} auf {square} deckt das Feld. Sie ist jetzt aufgedeckt.',
    captured: 'Der auf {square} geschlagene Bauer war die geheime Dame von {side}.',
    end: 'Die geheime Dame von {side} stand auf {square}.',
  },
};
