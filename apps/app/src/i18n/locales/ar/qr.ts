import type { Messages } from '../../core';
import type { qr as en } from '../en/qr';

export const qr: Messages<typeof en> = {
  addTitle: 'الإضافة برمز QR',
  addBody: 'اعرض رمزك أو افتح رمز صديق.',
  scanHint: 'امسحه بكاميرا الهاتف لفتح هذا الملف وإضافته صديقًا.',
  share: 'مشاركة',
  shareMessage: 'أضف {name} على ChessMate',
  copied: 'نُسخ الرابط',
  shareFailed: 'تعذّرت مشاركة الرابط',
  shareProfile: 'مشاركة',
  yourCode: 'رمزك',
  signInForCode: 'سجّل الدخول لتحصل على رمز QR خاص بك.',
  theirCode: 'رمز صديقك',
  theirCodeBody: 'امسح رمز صديقك بكاميرا هاتفك: يفتح ملفه مع زر «إضافة صديق». أو الصق هنا الرابط من رمزه.',
  linkLabel: 'رابط الملف أو اسم المستخدم',
  open: 'فتح الملف',
  invalidLink: 'هذا ليس رابط ملف ChessMate ولا اسم مستخدم.',
};
