import type { Messages } from '../../core';
import type { moveClass as en } from '../en/moveClass';

export const moveClass: Messages<typeof en> = {
  best: {
    phrase: 'der beste Zug',
    label: 'Bester Zug',
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
    phrase: 'ein Theoriezug',
    label: 'Theoriezug',
    symbol: 'Theorie',
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
  masterpiece: {
    label: 'Meisterwerk',
    phrase: 'ein Meisterwerk',
  },
  brilliant: {
    label: 'Brillant',
    phrase: 'brillant',
  },
  great: {
    label: 'Stark',
    phrase: 'ein starker Zug',
  },
  miss: {
    label: 'Verpasste Chance',
    phrase: 'eine verpasste Chance',
  },
};
