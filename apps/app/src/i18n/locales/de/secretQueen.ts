import type { Messages } from '../../core';
import type { secretQueen as en } from '../en/secretQueen';

export const secretQueen: Messages<typeof en> = {
  name: 'Geheime Dame',
  game: 'Partie',
  standard: 'Standard',
  standardHint: 'Normales Schach.',
  rules: 'Wähle vor deinem ersten Zug heimlich einen Bauern. Er kann wie eine Dame ziehen, dann wird er aufgedeckt. Gibt er Schach, zeigt er sich ebenfalls. Immer ungewertet.',
  casualOnly: 'Partien mit geheimer Dame sind immer ungewertet.',
  pick: 'Tippe auf einen deiner Bauern, um ihn zu deiner geheimen Dame zu machen.',
  chosen: 'Deine geheime Dame ist der Bauer auf {square}. Dein Gegner weiß es nicht.',
  change: 'Ändern',
  revealed: {
    moved: 'Die geheime Dame von {side} auf {square} zog wie eine Dame und ist aufgedeckt.',
    check: 'Die geheime Dame von {side} auf {square} gab Schach und ist aufgedeckt.',
    blocked: 'Dieser Zug ging nicht: Die geheime Dame von {side} auf {square} deckt das Feld. Sie ist jetzt aufgedeckt.',
    captured: 'Der auf {square} geschlagene Bauer war die geheime Dame von {side}.',
    end: 'Die geheime Dame von {side} stand auf {square}.',
  },
};
