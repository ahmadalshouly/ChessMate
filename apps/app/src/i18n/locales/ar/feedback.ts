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
  masterpiece: '{san}!!! تحفة فنية: تضحية بالوزير أو الرخ تفرض كش مات.',
  brilliant: '{san}!! تضحية تؤتي ثمارها: تقود إلى كش مات أو تمنح الأفضلية أو تستعيد المادة.',
  great: '{san}! النقلة الوحيدة التي تحافظ على الأفضلية. كل ما عداها أسوأ بوضوح.',
  miss: '{san} تضيّع فرصة بعد خطأ خصمك. كانت {best} ستعاقبه.',
};
