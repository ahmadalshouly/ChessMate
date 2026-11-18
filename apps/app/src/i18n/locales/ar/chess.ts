import type { Messages } from '../../core';
import type { chess as en } from '../en/chess';

export const chess: Messages<typeof en> = {
  piece: {
    p: 'البيدق',
    n: 'الحصان',
    b: 'الفيل',
    r: 'الرخ',
    q: 'الوزير',
    k: 'الملك',
    any: 'القطعة',
  },
  threat: {
    mate: 'كش مات بالنقلة {san}',
    check: 'كش بالنقلة {san}',
    capture: '{san} ويكسب {piece}',
    fork: '{san} بشوكة على {pieces}',
  },
  listSep: '، ',
  listAnd: ' و',
};
