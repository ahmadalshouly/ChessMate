import type { Messages } from '../../core';
import type { analysis as en } from '../en/analysis';

export const analysis: Messages<typeof en> = {
  evalA11y: 'التقييم {score}',
  evalPending: 'التقييم قيد الحساب',
  importError: 'تعذّرت قراءة ذلك. الصق FEN أو PGN.',
  engineOff: 'المحرك متوقف',
  depth: 'العمق {n}',
  lines: { other: 'الخطوط: {count}' },
  engine: 'المحرك',
  locked: 'تحليل المحرك متوقف لديك مباراة مباشرة. يعود بعد انتهائها.',
  connecting: 'جارٍ الاتصال بالمحرك…',
  moves: 'النقلات',
  empty: 'حرّك القطع لأي من الجانبين، أو استورد مباراة أدناه.',
  import: 'استيراد FEN / PGN',
  review: 'مراجعة المباراة',
  clear: 'مسح',
  placeholder: 'الصق FEN أو PGN، مثل 1. e4 e5 2. Nf3',
  load: 'تحميل',
  checkmate: 'كش مات',
  stalemate: 'جمود',
};
