import type { Messages } from '../../core';
import type { boardThemes as en } from '../en/boardThemes';

export const boardThemes: Messages<typeof en> = {
  graphite: {
    name: 'جرافيت',
    note: 'الافتراضي',
  },
  marble: {
    name: 'رخام',
    note: 'حجر معرّق',
  },
  slate: {
    name: 'أردواز',
    note: 'بارد وهادئ',
  },
  contrast: {
    name: 'تباين عالٍ',
    note: 'أقصى وضوح',
  },
  frost: {
    name: 'صقيع',
    note: 'زجاج مُصنفر',
  },
  onyx: {
    name: 'أونيكس',
    note: 'أسود لامع',
  },
  ivory: {
    name: 'عاجي',
    note: 'دافئ وهادئ',
  },
  walnut: {
    name: 'جوز',
    note: 'خشب داكن',
  },
  maple: {
    name: 'قيقب',
    note: 'خشب فاتح',
  },
  tournament: {
    name: 'بطولة',
    note: 'كلاسيكي الأندية',
  },
  ocean: {
    name: 'محيط',
    note: 'أزرق عميق',
  },
  midnight: {
    name: 'منتصف الليل',
    note: 'أزرق ليلي',
  },
  emerald: {
    name: 'زمرد',
    note: 'أخضر جوهري',
  },
  amethyst: {
    name: 'جمشت',
    note: 'بنفسجي ناعم',
  },
  rose: {
    name: 'وردي',
    note: 'وردي هادئ',
  },
  sand: {
    name: 'رمل',
    note: 'ضوء الصحراء',
  },
};
