import type { Messages } from '../../core';
import type { game as en } from '../en/game';

export const game: Messages<typeof en> = {
  action: {
    chat: 'الدردشة',
    more: 'المزيد',
    draw: 'تعادل',
    abort: 'إلغاء',
    resign: 'استسلام',
    back: 'السابق',
    forward: 'التالي',
    review: 'المراجعة',
    rematch: 'إعادة',
    takeback: 'تراجع',
    flip: 'قلب',
    newGame: 'جديدة',
  },
  moves: 'النقلات',
  noMoves: 'لا نقلات بعد.',
  backToLive: 'العودة إلى الوضع الحالي',
  viewingMove: 'عرض {move}',
  live: 'مباشر',
  close: 'إغلاق',
  more: {
    title: 'خيارات المباراة',
    flip: 'قلب الرقعة',
    cancelPremove: 'إلغاء النقلة المسبقة',
    newGame: 'مباراة {tc} جديدة',
    lobby: 'العودة إلى الردهة',
    reviewHistory: 'فتح في سجل المباريات',
    changeOpponent: 'اختيار خصم آخر',
    save: 'حفظ في سجل المباريات',
    saved: 'تم الحفظ في سجل المباريات',
  },
  resign: {
    title: 'هل تريد الاستسلام؟',
    body: 'سيفوز خصمك بالمباراة.',
    confirm: 'استسلام',
  },
  draw: {
    offered: 'تم عرض التعادل',
    offeredBody: 'بانتظار رد خصمك.',
  },
  player: {
    guest: 'لاعب ضيف',
    viewProfile: 'عرض الملف الكامل',
    rating: 'التصنيف',
    games: 'المباريات',
    record: '{w} فوز · {d} تعادل · {l} خسارة',
    noProfile: 'ليس لهذا اللاعب ملف عام.',
    you: 'أنت',
    toMove: 'دوره',
  },
  over: {
    close: 'إخفاء النتيجة',
    showResult: 'النتيجة',
  },
};
