import type { Messages } from '../../core';
import type { leaderboard as en } from '../en/leaderboard';

export const leaderboard: Messages<typeof en> = {
  standing: 'ترتيبك',
  global: 'عالمي',
  codeYours: 'رمز الدولة (رمزك: {code})',
  codeExample: 'رمز الدولة، مثل US',
  ranked: { other: 'لاعبون مصنّفون: {n}' },
  rankedIn: { other: 'لاعبون مصنّفون في {country}: {n}' },
  empty: 'لا لاعبين مصنّفين بعد',
  emptyFriends: 'أضف أصدقاء والعب مباريات مصنّفة لتقارن نفسك بهم.',
  emptyBody: 'يظهر اللاعبون هنا بعد أن يستقر تصنيفهم إثر بضع مباريات مصنّفة.',
  signInFriends: 'سجّل الدخول لترى الأصدقاء',
  chooseCountry: 'اختر دولة',
  unavailable: 'لوحة الصدارة غير متاحة',
  rowA11y: 'المركز {rank}، {name}، التصنيف {rating}',
  games: { other: 'المباريات: {count}' },
  peak: 'الأعلى {n}',
};
