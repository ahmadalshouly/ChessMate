import type { Messages } from '../../core';
import type { immortals as en } from '../en/immortals';

export const immortals: Messages<typeof en> = {
  title: 'الخالدون',
  overline: 'قاعة المشاهير',
  subtitle: 'أعظم المباريات في التاريخ، والأساطير الذين لعبوها.',
  stats: '{players} أسطورة · {games} مباراة',
  englishOnly: 'القصص والملاحظات بالإنجليزية حاليًا.',
  ofTheDay: 'خالدة اليوم',
  replay: 'أعد عرض المباراة',
  legends: 'الأساطير',
  games: 'المباريات الخالدة',
  gameCount: { zero: 'لا مباريات', one: 'مباراة واحدة', two: 'مباراتان', few: '{count} مباريات', many: '{count} مباراة', other: '{count} مباراة' },
  champion: 'بطل العالم',
  worldChampion: 'بطل العالم {years}',
  bornIn: 'وُلد عام {year}، {place}',
  lifespan: '{born}–{died}',
  alive: 'وُلد عام {born}',
  all: 'الكل',
  theme: {
    sacrifice: 'تضحيات',
    attack: 'هجمات',
    kingHunt: 'مطاردة الملك',
    strategy: 'استراتيجية',
    titleMatch: 'مباريات اللقب',
    prodigy: 'المواهب المبكرة',
  },
  outcome: {
    win: 'فوز',
    loss: 'خسارة',
    draw: 'تعادل',
  },
  player: {
    games: 'مباريات شهيرة',
    notFound: 'هذه الأسطورة ليست في المجموعة.',
    back: 'كل الأساطير',
  },
  game: {
    notFound: 'هذه المباراة ليست في المجموعة.',
    back: 'كل المباريات الخالدة',
    story: 'القصة',
    moments: 'اللحظات الحاسمة',
    moment: 'لحظة حاسمة',
    round: 'الجولة {round}',
    openAnalysis: 'افتح في رقعة التحليل',
    legends: 'أساطير في هذه المباراة',
  },
  learnCard: {
    title: 'الخالدون',
    body: 'أعد عرض أشهر المباريات في التاريخ، من مباراة أندرسن الخالدة إلى كارلسن في الثالثة عشرة.',
    open: 'استكشف الخالدين',
  },
};
