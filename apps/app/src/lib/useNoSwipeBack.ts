import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Screen options and Android handling for screens left only with their back button:
 * dragging a piece near the edge must never swipe the screen away (iOS edge swipe,
 * Android back gesture).
 */
export const NO_SWIPE_BACK = { gestureEnabled: false, fullScreenGestureEnabled: false } as const;

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
