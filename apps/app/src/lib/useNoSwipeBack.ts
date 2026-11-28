import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Screens are left only with their back button: no swipe-back anywhere. Every stack
 * (root, admin, each tab) spreads this into its screenOptions, which turns off the
 * iOS edge swipe and full-screen swipe (and swipe-down on sheets).
 */
export const NO_SWIPE_BACK = { gestureEnabled: false, fullScreenGestureEnabled: false } as const;

/**
 * Web: a sideways two-finger trackpad swipe (Chrome, Edge, Firefox) goes back a page
 * through the browser's overscroll. `overscroll-behavior-x: none` turns that off;
 * the browser's own back button still works. Mounted once at the root.
 */
export function useNoBrowserSwipeBack() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const els = [document.documentElement, document.body];
    const before = els.map((el) => el.style.overscrollBehaviorX);
    for (const el of els) el.style.overscrollBehaviorX = 'none';
    return () => els.forEach((el, i) => (el.style.overscrollBehaviorX = before[i] ?? ''));
  }, []);
}

/**
 * Training and lesson boards also ignore Android's system back (button or edge
 * gesture), so a piece dragged near the edge never leaves the screen.
 */
export function useNoSwipeBack() {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      // Swallow the system back gesture while this screen is shown.
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );
}
