import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import type { TKey } from '@/i18n';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type TabConfig = {
  /** Route name inside `src/app/(tabs)/`. */
  name: string;
  /** URL the tab opens. */
  href: '/' | '/puzzles' | '/learn' | '/social' | '/profile';
  /** Short label for the tab bar and sidebar (translation key). */
  label: TKey;
  /** Header title when this tab is open (translation key). */
  title: TKey;
  icon: IconName;
  iconActive: IconName;
};

/**
 * The app's top-level sections. Order here is the order in the tab bar and the
 * sidebar. Each section is a folder in `src/app/(tabs)/` with its own stack, so
 * feature work adds screens inside its folder without touching the shell.
 */
export const TABS: readonly TabConfig[] = [
  { name: '(home)', href: '/', label: 'nav.play', title: 'nav.play', icon: 'game-controller-outline', iconActive: 'game-controller' },
  { name: 'puzzles', href: '/puzzles', label: 'nav.puzzles', title: 'nav.puzzles', icon: 'extension-puzzle-outline', iconActive: 'extension-puzzle' },
  { name: 'learn', href: '/learn', label: 'nav.learn', title: 'nav.learnTitle', icon: 'school-outline', iconActive: 'school' },
  { name: 'social', href: '/social', label: 'nav.social', title: 'nav.social', icon: 'people-outline', iconActive: 'people' },
  { name: 'profile', href: '/profile', label: 'nav.profile', title: 'nav.profile', icon: 'person-circle-outline', iconActive: 'person-circle' },
];

/** Window width (dp) at which the shell switches from a bottom tab bar to a sidebar. */
export const SIDEBAR_BREAKPOINT = 960;
export const SIDEBAR_WIDTH = 248;
