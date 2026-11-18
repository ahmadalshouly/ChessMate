import type { Messages } from '../../core';
import type { social as en } from '../en/social';

export const social: Messages<typeof en> = {
  soon: {
    title: 'اجتماعي',
    blurb: 'العب مع أصدقائك، انضم إلى الأندية، واعرف أين تقف بينهم.',
    friends: 'الأصدقاء',
    friendsText: 'أضف أصدقاء وتحدَّهم في مباراة.',
    chat: 'الدردشة',
    chatText: 'راسل أصدقاءك وتحدّث أثناء المباريات الودية.',
    leaderboards: 'لوحات الصدارة',
    leaderboardsText: 'أفضل اللاعبين حسب نظام الوقت، عالميًا وبين الأصدقاء.',
    watch: 'المشاهدة',
    watchText: 'تابع المباريات المباشرة لأصدقائك وكبار اللاعبين.',
  },
  devSignIn: {
    title: 'سجّل الدخول لإضافة أصدقاء',
    dev: 'نسخة تطوير: اختر اسم مستخدم تجريبيًا. استخدم اسمًا مختلفًا على كل جهاز لتجربة الأصدقاء بينها.',
    placeholder: 'اسم المستخدم (من 3 إلى 20 حرفًا)',
    prod: 'الأصدقاء والمتابعة والنشاط متاحة بعد تسجيل الدخول.',
  },
  presence: {
    playing: 'يلعب الآن',
  },
};
