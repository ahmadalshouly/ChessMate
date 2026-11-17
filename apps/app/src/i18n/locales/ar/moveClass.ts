import type { Messages } from '../../core';
import type { moveClass as en } from '../en/moveClass';

export const moveClass: Messages<typeof en> = {
  best: {
    label: 'الأفضل',
    phrase: 'أفضل نقلة',
  },
  excellent: {
    label: 'ممتازة',
    phrase: 'نقلة ممتازة',
  },
  good: {
    label: 'جيدة',
    phrase: 'نقلة جيدة',
  },
  book: {
    label: 'نظرية',
    phrase: 'نقلة من النظرية',
  },
  forced: {
    label: 'إجبارية',
    phrase: 'نقلة إجبارية',
  },
  inaccuracy: {
    label: 'غير دقيقة',
    phrase: 'نقلة غير دقيقة',
  },
  mistake: {
    label: 'خطأ',
    phrase: 'خطأ',
  },
  blunder: {
    label: 'خطأ فادح',
    phrase: 'خطأ فادح',
  },
};
