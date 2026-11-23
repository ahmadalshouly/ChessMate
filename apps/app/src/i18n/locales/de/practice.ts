import type { Messages } from '../../core';
import type { practice as en } from '../en/practice';

export const practice: Messages<typeof en> = {
  undo: 'Rückgängig',
  threats: 'Drohungen',
  review: 'Analyse',
  hanging: '{color}: Figur auf {square} ({piece}) kann geschlagen werden',
  threatens: 'Der Gegner droht: {threat}',
  updateSaved: 'Gespeicherte Partie aktualisieren',
  save: 'Im Verlauf speichern',
};
