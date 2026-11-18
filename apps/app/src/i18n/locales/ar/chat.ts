import type { Messages } from '../../core';
import type { chat as en } from '../en/chat';

export const chat: Messages<typeof en> = {
  title: 'الدردشة',
  placeholder: 'رسالة',
  a11y: 'رسالة دردشة',
  quickA11y: 'رسائل سريعة',
  send: 'إرسال',
  unmute: 'إلغاء الكتم',
  mute: 'كتم',
  reported: 'تم الإبلاغ',
  report: 'إبلاغ',
  off: 'الدردشة متوقفة',
  on: 'الدردشة مفعّلة',
  offHint: 'الدردشة متوقفة. فعّلها لترى الرسائل.',
  empty: 'قل مرحبًا، أو استخدم رسالة سريعة.',
  hidden: { other: 'رسائل مخفية من لاعبين مكتومين: {count}' },
  quick: {
    hello: 'مرحبًا!',
    good_luck: 'بالتوفيق!',
    have_fun: 'استمتع!',
    nice_move: 'نقلة جميلة!',
    oops: 'عفوًا',
    thanks: 'شكرًا!',
    good_game: 'مباراة جيدة!',
    well_played: 'أحسنت اللعب',
    rematch: 'إعادة المباراة؟',
  },
};
