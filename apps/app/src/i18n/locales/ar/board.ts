import type { Messages } from '../../core';
import type { board as en } from '../en/board';

export const board: Messages<typeof en> = {
  nowUsing: 'المستخدم الآن',
  current: 'رقعة {board} · قطع {pieces}',
  themeA11y: 'سمة الرقعة',
  pieceSetA11y: 'مجموعة القطع',
  credits: 'حقوق رسومات القطع',
  themeTileA11y: 'رقعة {name}',
  pieceTileA11y: 'قطع {name}',
};
