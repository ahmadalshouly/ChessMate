import type { Messages } from '../../core';
import type { review as en } from '../en/review';

export const review: Messages<typeof en> = {
  nothing: 'لا شيء للمراجعة بعد. أنهِ مباراة أو حمّل واحدة في رقعة التحليل.',
  unavailable: 'المراجعة غير متاحة',
  locked: 'مراجعة المحرك متوقفة لديك مباراة مباشرة. عد بعد انتهائها.',
  reviewing: 'جارٍ مراجعة مباراتك…',
  progress: '{done} من {total} وضعًا',
  waitingEngine: 'بانتظار المحرك',
  moveIs: '{move}: {cls}',
  engineLine: 'خط المحرك: {line} ({eval})',
  stepThrough: 'تنقّل عبر المباراة لترى تقييم كل نقلة.',
  accuracy: 'الدقة',
  depth: 'عمق المحرك {n}',
  explore: 'استكشف في رقعة التحليل',
};
