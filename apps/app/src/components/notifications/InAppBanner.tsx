import { BlurView } from 'expo-blur';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import { useNotifications } from '@/lib/notifications';

import { KIND_GLYPH } from './format';

const VISIBLE_MS = 5000;

/** Frosted banner at the top of the screen for notifications that arrive while the app is open. */
export function InAppBanner() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { incoming, dismissIncoming, open } = useNotifications();

  useEffect(() => {
    if (!incoming) return;
    const timer = setTimeout(dismissIncoming, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [incoming, dismissIncoming]);

  if (!incoming) return null;
  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${incoming.title}. ${incoming.body}`}
        onPress={() => open(incoming)}
        style={[styles.card, { borderColor: t.glassBorder }]}>
        <BlurView intensity={50} tint={t.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.surface }]} />
        <View style={[styles.avatar, { backgroundColor: t.accent }]}>
          <Text style={{ color: t.onAccent, fontWeight: '700' }}>{KIND_GLYPH[incoming.kind]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>
            {incoming.title}
          </Text>
          <Text numberOfLines={2} style={{ color: t.muted, fontSize: 14 }}>
            {incoming.body}
          </Text>
        </View>
        <Pressable accessibilityLabel="Dismiss" hitSlop={10} onPress={dismissIncoming}>
          <Text style={{ color: t.muted, fontSize: 18 }}>×</Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 1000 },
  card: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
