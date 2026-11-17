import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { getSettings } from '@/features/account/settingsStore';

export type HapticKind = 'pickup' | 'move' | 'capture' | 'check' | 'premove' | 'illegal' | 'lowTime' | 'end';

/**
 * Light vibration cues for phones. expo-haptics ships in Expo Go, so this
 * needs no custom native code. Browsers get nothing: web vibration is patchy
 * and easy to find annoying.
 */
export function haptic(kind: HapticKind): void {
  if (Platform.OS === 'web' || !getSettings().sound.haptics) return;
  try {
    let p: Promise<void>;
    switch (kind) {
      case 'pickup':
      case 'premove':
        p = Haptics.selectionAsync();
        break;
      case 'move':
        p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'capture':
      case 'check':
        p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'illegal':
      case 'lowTime':
        p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'end':
        p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
    }
    void p.catch(() => {});
  } catch {
    // Devices without a vibration motor simply stay quiet.
  }
}
