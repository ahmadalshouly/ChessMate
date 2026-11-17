import type { Messages } from '../../core';
import type { feedback as en } from '../en/feedback';

export const feedback: Messages<typeof en> = {
  best: '{san} هي الخيار الأول للمحرك.',
  forced: '{san} كانت النقلة المسموحة الوحيدة.',
  book: '{san} نقلة افتتاح معروفة.',
  solid: '{san} نقلة متينة. كانت {best} أقوى قليلًا.',
  allows: 'تتيح للخصم: {threat}.',
  undefended: 'تركت {piece} في {square} دون حماية.',
  bad: '{san}: {cls}.{reason} الأفضل كان {best}.',
  masterpiece: '{san}!!! تحفة فنية: تُقدَّم الوزيرة والمحرك يؤيد ذلك.',
  brilliant: '{san}!! تضحية سليمة. تعود المادة بفائدة.',
  great: '{san}! النقلة الوحيدة التي تحافظ على الأفضلية. كل ما عداها أسوأ بوضوح.',
  miss: '{san} تضيّع فرصة بعد خطأ خصمك. كانت {best} ستعاقبه.',
};
