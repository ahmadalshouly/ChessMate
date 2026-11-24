import type { Messages } from '../../core';
import type { football as en } from '../en/football';

export const football: Messages<typeof en> = {
  title: 'Football Mate',
  hint: 'اختر نادي كرة القدم الذي تشجعه. يظهر شعاره بجانب اسمك في ملفك الشخصي وفي المباريات.',
  label: 'ناديك',
  notSet: 'بلا نادٍ',
  search: 'ابحث عن الأندية',
  placeholder: 'اكتب اسم نادٍ',
  noResults: 'لا يوجد نادٍ يطابق "{q}".',
  supports: 'يشجع {club}',
  leagues: {
    premierLeague: 'الدوري الإنجليزي الممتاز',
    laLiga: 'الدوري الإسباني',
    serieA: 'الدوري الإيطالي',
    bundesliga: 'الدوري الألماني',
    ligue1: 'الدوري الفرنسي',
    eredivisie: 'الدوري الهولندي',
    primeiraLiga: 'الدوري البرتغالي',
    scottish: 'الدوري الاسكتلندي',
    superLig: 'الدوري التركي',
    saudiPro: 'دوري روشن السعودي',
    egyptian: 'الدوري المصري الممتاز',
    mls: 'الدوري الأمريكي',
    southAmerica: 'أمريكا الجنوبية',
    other: 'أخرى',
  },
};
