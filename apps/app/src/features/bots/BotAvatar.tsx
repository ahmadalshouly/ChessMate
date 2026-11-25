import { useState } from 'react';
import { Image, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { Text } from '@/ui/primitives';

import type { Opponent } from './opponents';

/**
 * A computer opponent's picture: the online bot's own image when it has one,
 * otherwise a monogram. The ring grows with strength, a quiet cue for how hard
 * the bot is (one step per band).
 */
export function BotAvatar({ bot, size = 40, inverted }: { bot: Pick<Opponent, 'name' | 'initial' | 'rating' | 'avatar'>; size?: number; inverted?: boolean }) {
  const t = useTheme();
  const [broken, setBroken] = useState(false);
  const ring = Math.max(1, Math.min(4, 1 + Math.floor(bot.rating / 1000)));
  const photo = bot.avatar && !broken ? bot.avatar : null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ring,
        borderColor: inverted ? t.onAccent : t.text,
        backgroundColor: inverted ? 'transparent' : t.surfaceSolid,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: size - ring * 2, height: size - ring * 2, borderRadius: size / 2 }} onError={() => setBroken(true)} />
      ) : (
        <Text style={{ color: inverted ? t.onAccent : t.text, fontSize: size * 0.42, fontWeight: '700' }}>{bot.initial}</Text>
      )}
    </View>
  );
}
