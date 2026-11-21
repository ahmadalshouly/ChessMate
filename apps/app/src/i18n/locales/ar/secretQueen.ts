import type { Messages } from '../../core';
import type { secretQueen as en } from '../en/secretQueen';

export const secretQueen: Messages<typeof en> = {
  name: 'الوزير السري',
  game: 'المباراة',
  standard: 'عادية',
  standardHint: 'شطرنج عادي.',
  rules: 'اختر سرًا أحد بيادقك قبل نقلتك الأولى، والاختيار نهائي. يمكنه التحرك كوزير فيُكشف، ويُكشف إذا أعطى كشًّا. دائمًا ودية ولا تختلط بالمباريات العادية.',
  casualOnly: 'مباريات الوزير السري دائمًا ودية.',
  pick: 'اختر وزيرك السري: اضغط على أحد البيادق المميزة. لا يمكنك تغييره لاحقًا.',
  chosen: 'وزيرك السري هو البيدق في {square}. الاختيار نهائي وخصمك لا يعرف.',
  revealed: {
    moved: 'تحرك الوزير السري لـ{side} في {square} كوزير وكُشف.',
    check: 'أعطى الوزير السري لـ{side} في {square} كشًّا وكُشف.',
    blocked: 'لم تكن هذه النقلة ممكنة: الوزير السري لـ{side} في {square} يحمي المربع. كُشف الآن.',
    captured: 'البيدق المأخوذ في {square} كان الوزير السري لـ{side}.',
    end: 'كان الوزير السري لـ{side} في {square}.',
  },
};
