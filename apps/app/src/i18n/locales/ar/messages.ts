import type { Messages } from '../../core';
import type { messages as en } from '../en/messages';

export const messages: Messages<typeof en> = {
  title: 'الرسائل',
  subtitle: 'محادثات مع اللاعبين ورسائل من فريق ChessMate.',
  new: 'رسالة جديدة',
  loadFailed: 'تعذّر تحميل الرسائل',
  sendFailed: 'تعذّر إرسال الرسالة',
  emptyTitle: 'لا رسائل بعد',
  emptyBody: 'افتح ملف أحد أصدقائك واضغط «رسالة» لبدء محادثة.',
  team: 'فريق ChessMate',
  you: 'أنت',
  unread: {
    other: '{count} رسالة غير مقروءة',
  },
  startConversation: 'قل مرحبًا لـ{name}.',
  announcement: 'إعلان',
  teamReadOnly: 'هكذا يتواصل معك فريق ChessMate. لا يمكن الرد هنا.',
  cannotSend: 'لا يمكنك مراسلة هذا اللاعب.',
  placeholder: 'اكتب رسالة',
  send: 'إرسال',
};
