export const awards = {
  title: 'الجوائز',
  titleOf: 'جوائز {name}',
  collection: 'المجموعة',
  levelsCount: '{earned} من {total} مستوى',
  recent: 'أحدث الجوائز',
  seeAll: 'عرض الكل',
  locked: 'لم تُحقق بعد',
  maxed: 'تم تحقيق كل المستويات',
  progress: '{value} / {next}',
  value: 'حتى الآن {value}',
  levels: 'المستويات',
  earnedOn: 'تحققت في {date}',
  countriesTitle: 'الدول',
  none: 'لا توجد جوائز بعد. العب مباريات لتحصل على أولى جوائزك.',
  noneOf: 'لا توجد جوائز لـ {name} بعد.',
  signIn: 'سجّل الدخول لتجمع الجوائز من مبارياتك.',
  loadFailed: 'تعذر تحميل الجوائز: {reason}',
  unlocked: 'حصلت على جائزة',
  unlockedMany: {
    other: 'حصلت على {count} جوائز',
  },
  view: 'عرض',
  andMore: {
    other: 'و{count} أخرى',
  },
  filters: {
    all: 'الكل',
    earned: 'المحققة',
    openings: 'الافتتاحيات',
    ratings: 'التصنيفات',
    countries: 'الدول',
    checkmates: 'أنواع الكش مات',
    milestones: 'إنجازات',
  },
  tiers: {
    bronze: 'برونزي',
    silver: 'فضي',
    gold: 'ذهبي',
    platinum: 'بلاتيني',
    diamond: 'ماسي',
  },
  items: {
    opening: {
      desc: {
        other: 'فُز بـ {count} مباريات في {opening}',
      },
    },
    rating: {
      name: 'تصنيف {category}',
      desc: {
        other: 'صل إلى تصنيف {count} في {category}',
      },
    },
    explorer: {
      name: 'مستكشف الافتتاحيات',
      desc: {
        other: 'العب {count} افتتاحيات مختلفة',
      },
    },
    countriesPlayed: {
      name: 'الرحّالة',
      desc: {
        other: 'العب ضد خصوم من {count} دول',
      },
    },
    countriesBeaten: {
      name: 'فاتح العالم',
      desc: {
        other: 'اهزم خصومًا من {count} دول',
      },
    },
    matesTotal: {
      name: 'فنان الكش مات',
      desc: {
        other: 'نفّذ {count} كش مات',
      },
    },
    gamesPlayed: {
      name: 'المثابر',
      desc: {
        other: 'العب {count} مباريات',
      },
    },
    gamesWon: {
      name: 'الفائز',
      desc: {
        other: 'فُز بـ {count} مباريات',
      },
    },
  },
  mates: {
    backRank: {
      name: 'كش مات الصف الأخير',
      desc: {
        other: 'نفّذ كش مات على ملك محاصر في صفه الأخير ({count} مرات)',
      },
    },
    smothered: {
      name: 'الكش مات الخانق',
      desc: {
        other: 'نفّذ كش مات بالحصان على ملك تحاصره قطعه ({count} مرات)',
      },
    },
    doubleCheck: {
      name: 'كش مات مزدوج',
      desc: {
        other: 'نفّذ كش مات بقطعتين تكشّان معًا ({count} مرات)',
      },
    },
    discovered: {
      name: 'كش مات مكشوف',
      desc: {
        other: 'نفّذ كش مات بتحريك قطعة من الطريق ({count} مرات)',
      },
    },
    castling: {
      name: 'كش مات بالتبييت',
      desc: {
        other: 'نفّذ كش مات بالتبييت ({count} مرات)',
      },
    },
    enPassant: {
      name: 'كش مات بالأخذ في المرور',
      desc: {
        other: 'نفّذ كش مات بالأخذ في المرور ({count} مرات)',
      },
    },
    promotion: {
      name: 'كش مات بالترقية',
      desc: {
        other: 'نفّذ كش مات بترقية بيدق إلى وزير ({count} مرات)',
      },
    },
    underpromotion: {
      name: 'كش مات بترقية صغرى',
      desc: {
        other: 'نفّذ كش مات بترقية إلى قلعة أو فيل أو حصان ({count} مرات)',
      },
    },
    pawn: {
      name: 'كش مات بالبيدق',
      desc: {
        other: 'نفّذ كش مات ببيدق ({count} مرات)',
      },
    },
    knight: {
      name: 'كش مات بالحصان',
      desc: {
        other: 'نفّذ كش مات بحصان ({count} مرات)',
      },
    },
    bishop: {
      name: 'كش مات بالفيل',
      desc: {
        other: 'نفّذ كش مات بفيل ({count} مرات)',
      },
    },
    rook: {
      name: 'كش مات بالقلعة',
      desc: {
        other: 'نفّذ كش مات بقلعة ({count} مرات)',
      },
    },
    queen: {
      name: 'كش مات بالوزير',
      desc: {
        other: 'نفّذ كش مات بوزيرك ({count} مرات)',
      },
    },
    king: {
      name: 'كش مات بالملك',
      desc: {
        other: 'نفّذ كش مات بتحريك ملكك ({count} مرات)',
      },
    },
    quick: {
      name: 'كش مات خاطف',
      desc: {
        other: 'نفّذ كش مات خلال 15 نقلة ({count} مرات)',
      },
    },
  },
  openings: {
    sicilian: 'الدفاع الصقلي',
    ruyLopez: 'الافتتاح الإسباني (روي لوبيز)',
    italian: 'الافتتاح الإيطالي',
    french: 'الدفاع الفرنسي',
    caroKann: 'دفاع كارو-كان',
    queensGambit: 'مناورة الوزير',
    slav: 'الدفاع السلافي',
    kingsIndian: 'الدفاع الهندي الملكي',
    nimzoIndian: 'دفاع نيمزو الهندي',
    grunfeld: 'دفاع غرونفيلد',
    english: 'الافتتاح الإنجليزي',
    london: 'نظام لندن',
    kingsGambit: 'مناورة الملك',
    scotch: 'الافتتاح الاسكتلندي',
    vienna: 'افتتاح فيينا',
    scandinavian: 'الدفاع الإسكندنافي',
    pirc: 'دفاع بيرتس والدفاع الحديث',
    dutch: 'الدفاع الهولندي',
    catalan: 'الافتتاح الكتالوني',
    petrov: 'دفاع بتروف',
    alekhine: 'دفاع أليخين',
    benoni: 'دفاع بينوني',
  },
};
