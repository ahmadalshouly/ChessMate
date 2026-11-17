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
};
