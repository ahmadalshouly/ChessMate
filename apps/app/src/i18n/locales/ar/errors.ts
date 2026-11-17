import type { Messages } from '../../core';
import type { errors as en } from '../en/errors';

export const errors: Messages<typeof en> = {
  network: 'تعذّر الوصول إلى ChessMate الآن. تحقق من اتصالك وحاول مجددًا.',
  generic: 'حدث خطأ ما.',
  server: 'حدث خطأ من جهتنا. حاول مرة أخرى.',
  tryAgain: 'حدث خطأ ما. حاول مرة أخرى.',
};
