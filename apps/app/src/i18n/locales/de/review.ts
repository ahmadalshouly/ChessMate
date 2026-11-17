import type { Messages } from '../../core';
import type { review as en } from '../en/review';

export const review: Messages<typeof en> = {
  nothing: 'Noch nichts zu analysieren. Beende eine Partie oder lade eine auf dem Analysebrett.',
  unavailable: 'Analyse nicht verfügbar',
  locked: 'Die Engine-Analyse ist aus, solange du eine Live-Partie hast. Komm zurück, wenn sie endet.',
  reviewing: 'Deine Partie wird analysiert…',
  progress: '{done} von {total} Stellungen',
  waitingEngine: 'Warte auf die Engine',
  moveIs: '{move} ist {cls}',
  engineLine: 'Engine-Variante: {line} ({eval})',
  stepThrough: 'Geh die Partie durch, um die Bewertung jedes Zugs zu sehen.',
  accuracy: 'Genauigkeit',
  depth: 'Engine-Tiefe {n}',
  explore: 'Auf dem Analysebrett erkunden',
};
