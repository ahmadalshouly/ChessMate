import type { Messages } from '../../core';
import type { cookies as en } from '../en/cookies';

export const cookies: Messages<typeof en> = {
  banner: {
    title: 'ملفات تعريف الارتباط في ChessMate',
    body: 'نستخدم فقط التخزين الذي يحتاجه ChessMate لإبقائك مسجّل الدخول وتذكّر إعداداتك. وبموافقتك، يمكن لقسم المشاهدة أيضًا تحميل مشغّلات البث المباشر من Twitch وYouTube وKick، وهي تضع ملفات تعريف ارتباط خاصة بها. يمكنك تغيير ذلك في أي وقت من الإعدادات ← الخصوصية.',
    necessary: 'الضرورية فقط',
    acceptAll: 'قبول الكل',
    settings: 'الإعدادات وسياسة ملفات تعريف الارتباط',
  },
  prefs: {
    title: 'ملفات تعريف الارتباط',
    necessary: 'ضرورية',
    necessaryDetail: 'تسجيل الدخول واللغة والإعدادات والمباريات المحفوظة على هذا الجهاز. مفعّلة دائمًا لأن التطبيق لا يعمل بدونها.',
    externalMedia: 'الوسائط الخارجية',
    externalMediaDetail: 'مشغّلات البث المباشر من Twitch وYouTube وKick في قسم المشاهدة. تضع ملفات تعريف ارتباط خاصة بها.',
    externalMediaDetailApp: 'ينطبق على موقع ChessMate. في التطبيق يُفتح البث على منصته.',
    noTracking: 'لا يستخدم ChessMate ملفات تعريف ارتباط للتحليلات أو الإعلانات.',
    savedAt: 'حُفظ اختيارك على هذا الجهاز: {date}',
  },
  embed: {
    notice: 'يعمل هذا البث في مشغّل {platform}، الذي يضع ملفات تعريف ارتباط ويرسل عنوان IP الخاص بك إلى {platform}. اسمح بالوسائط الخارجية لمشاهدته هنا، أو اضغط على الصورة لفتحه على {platform}.',
    load: 'السماح بالوسائط الخارجية',
    policy: 'سياسة ملفات تعريف الارتباط',
  },
};
