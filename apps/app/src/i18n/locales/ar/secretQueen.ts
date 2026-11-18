import type { Messages } from '../../core';
import type { secretQueen as en } from '../en/secretQueen';

export const secretQueen: Messages<typeof en> = {
  name: 'الملكة السرية',
  standard: 'قياسي',
  variant: 'النوع',
  variantHint: 'الملكة السرية: أحد بيادقك ملكة في الخفاء. دائماً غير مصنّفة.',
  lobbyTag: 'الملكة السرية',
  pickTitle: 'اختر ملكتك السرية',
  pickBody: 'اضغط على أحد بيادقك. يتحرك مثل الملكة، لكن خصمك يراه بيدقاً حتى يضطر إلى الظهور.',
  oppPicking: 'خصمك يختار ملكته السرية.',
  yours: 'ملكتك السرية في {square}. أنت وحدك ترى التاج.',
  revealed: {
    moved: 'كُشفت {queen}: تحركت كملكة من {square}.',
    promoted: 'وصلت {queen} إلى الصف الأخير فكُشفت.',
    check: '{queen} في {square} تعطي كش.',
    blocked: '{queen} في {square} منعت تلك النقلة.',
    captured: 'البيدق المأخوذ في {square} كان {queenLower}.',
    gameEnd: 'كانت {queen} في {square}.',
  },
  sideYour: 'ملكتك السرية',
  sideTheir: 'الملكة السرية لخصمك',
  sideWhite: 'الملكة السرية للأبيض',
  sideBlack: 'الملكة السرية للأسود',
  sideYourLower: 'ملكتك السرية',
  sideTheirLower: 'الملكة السرية لخصمك',
  sideWhiteLower: 'الملكة السرية للأبيض',
  sideBlackLower: 'الملكة السرية للأسود',
  rulesTitle: 'كيف تعمل الملكة السرية',
  rules: 'اختر بيدقاً قبل نقلتك الأولى. إنه ملكة متنكرة: يمكنه التحرك كبيدق ويبقى مخفياً، أو التحرك كملكة فيُكشف. ويُكشف أيضاً عندما يعطي كش، أو يصل إلى الصف الأخير، أو يُؤخذ، أو يمنع إحدى نقلات خصمك.',
  noReview: 'مباريات الملكة السرية لا تُحفظ في سجلك ولا تُراجع حالياً.',
};
