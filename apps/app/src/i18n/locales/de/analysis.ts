import type { Messages } from '../../core';
import type { analysis as en } from '../en/analysis';

export const analysis: Messages<typeof en> = {
  evalA11y: 'Bewertung {score}',
  evalPending: 'Bewertung ausstehend',
  importError: 'Das konnte nicht gelesen werden. Füge FEN oder PGN ein.',
  engineOff: 'Engine aus',
  depth: 'Tiefe {n}',
  lines: { one: '{count} Variante', other: '{count} Varianten' },
  engine: 'Engine',
  locked: 'Die Engine-Analyse ist aus, solange du eine Live-Partie hast. Sie kommt zurück, wenn die Partie endet.',
  connecting: 'Verbinde mit der Engine…',
  moves: 'Züge',
  empty: 'Zieh Figuren für beide Seiten oder importiere unten eine Partie.',
  import: 'FEN / PGN importieren',
  review: 'Partie analysieren',
  clear: 'Leeren',
  placeholder: 'FEN oder PGN einfügen, z. B. 1. e4 e5 2. Nf3',
  load: 'Laden',
  checkmate: 'Schachmatt',
  stalemate: 'Patt',
};
