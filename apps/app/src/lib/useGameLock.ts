import { useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * While a game is running, the screen can't be left by accident: no back
 * button in the header, no swipe-back, Android's back button does nothing,
 * and on the web closing or reloading the tab asks first. Once the game ends
 * everything works as usual. Resigning stays in the game's own controls.
 *
 * Returns header options to spread into the screen's <Stack.Screen options>.
 */
export function useGameLock(locked: boolean) {
  const navigation = useNavigation();

  // Back gestures, header back and router.back() all go through this.
  useEffect(() => {
    if (!locked) return;
    // expo-router's navigation type doesn't list stack events; beforeRemove is the stack's own.
    const nav = navigation as unknown as { addListener: (type: 'beforeRemove', cb: (e: { preventDefault: () => void }) => void) => () => void };
    return nav.addListener('beforeRemove', (e) => e.preventDefault());
  }, [locked, navigation]);

  useEffect(() => {
    if (!locked || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [locked]);

  useEffect(() => {
    if (!locked || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [locked]);

  return locked ? { headerBackVisible: false, headerLeft: () => null, gestureEnabled: false } : { headerBackVisible: true };
}
