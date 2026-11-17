import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type TabConfig = {
  /** Route name inside `src/app/(tabs)/`. */
  name: string;
  /** URL the tab opens. */
  href: '/' | '/puzzles' | '/learn' | '/social' | '/profile';
  /** Short label for the tab bar and sidebar. */
  label: string;
  /** Header title when this tab is open. */
  title: string;
  icon: IconName;
  iconActive: IconName;
};

/**
 * The app's top-level sections. Order here is the order in the tab bar and the
 * sidebar. Each section is a folder in `src/app/(tabs)/` with its own stack, so
 * feature work adds screens inside its folder without touching the shell.
 */
export const TABS: readonly TabConfig[] = [
  { name: '(home)', href: '/', label: 'Play', title: 'Play', icon: 'game-controller-outline', iconActive: 'game-controller' },
  { name: 'puzzles', href: '/puzzles', label: 'Puzzles', title: 'Puzzles', icon: 'extension-puzzle-outline', iconActive: 'extension-puzzle' },
  { name: 'learn', href: '/learn', label: 'Learn', title: 'Learn & Coach', icon: 'school-outline', iconActive: 'school' },
  { name: 'social', href: '/social', label: 'Social', title: 'Social', icon: 'people-outline', iconActive: 'people' },
  { name: 'profile', href: '/profile', label: 'Profile', title: 'Profile', icon: 'person-circle-outline', iconActive: 'person-circle' },
];

/** Window width (dp) at which the shell switches from a bottom tab bar to a sidebar. */
export const SIDEBAR_BREAKPOINT = 960;
export const SIDEBAR_WIDTH = 248;
