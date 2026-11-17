import type { Messages } from '../../core';
import type { report as en } from '../en/report';

export const report: Messages<typeof en> = {
  sent: 'أُرسل البلاغ',
  what: 'ماذا حدث؟ تتضمن البلاغات دردشة هذه المباراة ونقلاتها.',
  details: 'التفاصيل (اختياري)',
  failed: 'تعذّر إرسال البلاغ. حاول بعد قليل.',
  thanks: 'شكرًا. سيراجع أحد المشرفين حساب {name}. يمكنك أيضًا كتمه من لوحة الدردشة.',
  title: 'الإبلاغ عن {name}',
  sending: 'جارٍ الإرسال…',
  send: 'إرسال البلاغ',
  reasons: {
    abusive_chat: 'دردشة مسيئة أو مهينة',
    cheating: 'غش أو استخدام محرك',
    spam: 'رسائل مزعجة أو إعلانات',
    offensive_name: 'اسم مستخدم مسيء',
    unsporting: 'سلوك غير رياضي (المماطلة، المغادرة)',
    other: 'سبب آخر',
  },
};
