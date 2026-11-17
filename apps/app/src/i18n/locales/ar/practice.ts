import type { Messages } from '../../core';
import type { practice as en } from '../en/practice';

export const practice: Messages<typeof en> = {
  undo: 'تراجع',
  threats: 'التهديدات',
  review: 'مراجعة',
  toMoveInCheck: 'دور {color} (في وضع كش)',
  hanging: 'يمكن أسر {piece} ({color}) في {square}',
  threatens: 'الخصم يهدد: {threat}',
  updateSaved: 'تحديث المباراة المحفوظة',
  save: 'حفظ في السجل',
};
