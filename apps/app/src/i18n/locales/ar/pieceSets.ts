import type { Messages } from '../../core';
import type { pieceSets as en } from '../en/pieceSets';

export const pieceSets: Messages<typeof en> = {
  classic: {
    name: 'كلاسيكي',
    note: 'طراز البطولات',
  },
  glass: {
    name: 'زجاج',
    note: 'توقيعنا',
  },
  spatial: {
    name: 'مجسّم',
    note: 'منحوت وخفيف',
  },
  celtic: {
    name: 'سلتي',
    note: 'منقوش',
  },
  fantasy: {
    name: 'خيالي',
    note: 'مزخرف',
  },
  bold: {
    name: 'عريض',
    note: 'تصويري وعصري',
  },
  caramel: {
    name: 'كراميل',
    note: 'دافئ وودود',
  },
  shapes: {
    name: 'أشكال',
    note: 'تجريدي وللمرح',
  },
  cburnett: {
    name: 'كبرنت',
    note: 'المظهر المألوف على الإنترنت',
  },
  firi: {
    name: 'فيري',
    note: 'نظيف ومستدير',
  },
  skulls: {
    name: 'جماجم',
    note: 'مخيف وللمرح',
  },
  eyes: {
    name: 'عيون',
    note: 'يقظ وللمرح',
  },
  prmi: {
    name: 'قطط',
    note: 'قططي وللمرح',
  },
};
