import type { Messages } from '../../core';
import type { moveClass as en } from '../en/moveClass';

export const moveClass: Messages<typeof en> = {
  best: {
    label: 'Bester',
    phrase: 'der beste Zug',
  },
  excellent: {
    label: 'Ausgezeichnet',
    phrase: 'ausgezeichnet',
  },
  good: {
    label: 'Gut',
    phrase: 'gut',
  },
  book: {
    label: 'Theorie',
    phrase: 'ein Theoriezug',
  },
  forced: {
    label: 'Erzwungen',
    phrase: 'erzwungen',
  },
  inaccuracy: {
    label: 'Ungenauigkeit',
    phrase: 'eine Ungenauigkeit',
  },
  mistake: {
    label: 'Fehler',
    phrase: 'ein Fehler',
  },
  blunder: {
    label: 'Patzer',
    phrase: 'ein grober Patzer',
  },
};
