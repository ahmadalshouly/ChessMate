import type { Messages } from '../../core';
import type { common as en } from '../en/common';

export const common: Messages<typeof en> = {
  back: 'رجوع',
  backTo: 'العودة إلى {title}',
  comingSoon: 'قريبًا',
  time: {
    justNow: 'الآن',
    minutesAgo: { other: 'قبل {count} د' },
    hoursAgo: { other: 'قبل {count} س' },
    daysAgo: { zero: 'قبل يوم', one: 'قبل يوم', two: 'قبل يومين', few: 'قبل {count} أيام', many: 'قبل {count} يومًا', other: 'قبل {count} يوم' },
  },
  category: {
    bullet: 'رصاصة',
    blitz: 'خاطفة',
    rapid: 'سريعة',
    classical: 'كلاسيكية',
    correspondence: 'يومية',
  },
  or: 'أو',
  saving: 'جارٍ الحفظ…',
  continue: 'متابعة',
  less: '{label} أقل',
  more: '{label} أكثر',
  flipBoard: 'قلب الرقعة',
  decline: 'رفض',
  cancel: 'إلغاء',
  accept: 'قبول',
  guest: 'ضيف',
  close: 'إغلاق',
  errors: {
    unreachable: 'تعذّر الوصول إلى خادم ChessMate على {url}',
  },
  tryAgain: 'حاول مرة أخرى',
  previous: 'السابق',
  next: 'التالي',
  send: 'إرسال',
  nav: {
    first: 'النقلة الأولى',
    previous: 'النقلة السابقة',
    pause: 'إيقاف مؤقت',
    playThrough: 'تشغيل تلقائي',
    next: 'النقلة التالية',
    last: 'النقلة الأخيرة',
  },
  loading: 'جارٍ التحميل…',
  dismiss: 'إغلاق',
};
