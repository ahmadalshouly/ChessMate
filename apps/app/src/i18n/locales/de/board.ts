import type { Messages } from '../../core';
import type { board as en } from '../en/board';

export const board: Messages<typeof en> = {
  nowUsing: 'Aktuell',
  current: 'Brett {board} · Figuren {pieces}',
  themeA11y: 'Brettdesign',
  pieceSetA11y: 'Figurensatz',
  credits: 'Quellen der Figurengrafiken',
  themeTileA11y: 'Brett {name}',
  pieceTileA11y: 'Figuren {name}',
};
