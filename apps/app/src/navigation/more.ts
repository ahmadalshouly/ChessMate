import type Ionicons from '@expo/vector-icons/Ionicons';
import type { Href } from 'expo-router';
import type { ComponentProps } from 'react';

import type { TKey } from '@/i18n';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface MoreItem {
  key: string;
  label: TKey;
  icon: IconName;
  href?: Href;
  /** Shown as "coming soon" and not tappable. */
  soon?: boolean;
}

export interface MoreSection {
  title: TKey;
  items: MoreItem[];
}

/**
 * Everything behind "More" in the bottom bar (phones) and below the main
 * sections in the sidebar (web). Play, Watch and Tournaments are in the bar.
 */
export const MORE_SECTIONS: MoreSection[] = [
  {
    title: 'more.section.play',
    items: [
      { key: 'learn', label: 'more.learn', icon: 'school-outline', href: '/learn' },
      { key: 'analysis', label: 'more.analysis', icon: 'analytics-outline', href: '/analysis' },
      { key: 'digDeep', label: 'more.digDeep', icon: 'compass-outline', href: '/dig-deep' },
      { key: 'tournaments', label: 'more.tournaments', icon: 'trophy-outline', href: '/tournaments' },
      { key: 'puzzles', label: 'more.puzzles', icon: 'extension-puzzle-outline', href: '/puzzles' },
    ],
  },
  {
    title: 'more.section.community',
    items: [
      { key: 'friends', label: 'more.friends', icon: 'people-outline', href: '/social' },
      { key: 'news', label: 'more.news', icon: 'newspaper-outline', href: '/news' },
      { key: 'forum', label: 'more.forum', icon: 'chatbubbles-outline', href: '/forum' },
    ],
  },
  {
    title: 'more.section.you',
    items: [
      { key: 'profile', label: 'more.profile', icon: 'person-circle-outline', href: '/profile' },
      { key: 'awards', label: 'more.awards', icon: 'ribbon-outline', href: '/awards' },
      { key: 'limits', label: 'more.limits', icon: 'hourglass-outline', href: '/play-limits' },
      { key: 'settings', label: 'more.settings', icon: 'settings-outline', href: '/settings' },
    ],
  },
  {
    title: 'more.section.chessmate',
    items: [
      { key: 'about', label: 'more.about', icon: 'information-circle-outline', href: '/about' },
      { key: 'support', label: 'more.support', icon: 'help-buoy-outline', href: '/support' },
      { key: 'donate', label: 'more.donate', icon: 'heart-outline', href: '/donate' },
      { key: 'privacy', label: 'more.privacy', icon: 'lock-closed-outline', href: '/privacy' },
      { key: 'cookies', label: 'more.cookies', icon: 'finger-print-outline', href: '/cookies' },
      { key: 'fairPlay', label: 'more.fairPlay', icon: 'shield-checkmark-outline', href: '/fair-play' },
    ],
  },
];

/** Tabs shown in the phone bottom bar; the rest of the sections live behind More. */
export const BAR_TAB_NAMES = ['(home)', 'watch', 'tournaments'] as const;
