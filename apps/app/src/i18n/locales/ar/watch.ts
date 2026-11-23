import type { Messages } from '../../core';
import type { watch as en } from '../en/watch';

export const watch: Messages<typeof en> = {
  byAbandonment: 'بالانسحاب',
  aborted: '(أُلغيت)',
  title: '{white} ضد {black}',
  watch: 'مشاهدة',
  ended: 'انتهت هذه المباراة أو أنها غير موجودة.',
  couldNotOpen: 'تعذّر فتح هذه المباراة.',
  live: { other: 'مباشر · يشاهد {count}' },
  none: 'لا توجد مباريات مباشرة الآن. عندما يبدأ أصدقاؤك أو اللاعبون الذين تتابعهم مباراة، ستظهر هنا.',
};
