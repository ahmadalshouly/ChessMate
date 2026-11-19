import type { Messages } from '../../core';
import type { secretQueen as en } from '../en/secretQueen';

export const secretQueen: Messages<typeof en> = {
  name: 'الوزير السري',
  game: 'المباراة',
  standard: 'عادية',
  standardHint: 'شطرنج عادي.',
  rules: 'اختر سرًا أحد بيادقك قبل نقلتك الأولى. يمكنه التحرك كوزير، وعندها يُكشف. ويُكشف أيضًا إذا أعطى كشًّا. دائمًا ودية.',
  casualOnly: 'مباريات الوزير السري دائمًا ودية.',
  pick: 'اضغط على أحد بيادقك ليصبح وزيرك السري.',
  chosen: 'وزيرك السري هو البيدق في {square}. خصمك لا يعرف.',
  change: 'تغيير',
  revealed: {
    moved: 'تحرك الوزير السري لـ{side} في {square} كوزير وكُشف.',
    check: 'أعطى الوزير السري لـ{side} في {square} كشًّا وكُشف.',
    blocked: 'لم تكن هذه النقلة ممكنة: الوزير السري لـ{side} في {square} يحمي المربع. كُشف الآن.',
    captured: 'البيدق المأخوذ في {square} كان الوزير السري لـ{side}.',
    end: 'كان الوزير السري لـ{side} في {square}.',
  },
};
