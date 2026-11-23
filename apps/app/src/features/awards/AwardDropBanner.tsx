import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { Text, useAppTheme } from '@/ui';

import { AwardBadge } from './AwardBadge';
import { awardName, tierColor, tierName } from './catalog';
import { dismissDrop, useAwardDrop } from './drops';

const VISIBLE_MS = 3600;

/**
 * Drops an "Award unlocked" banner from the top, then slides it away. Mount
 * one at the app root and one inside any full-screen modal (the result box).
 * Tapping opens Awards from the root; inside a modal it just dismisses.
 */
export function AwardDropBanner({ openOnTap = true }: { openOnTap?: boolean }) {
  const tr = useT();
  const t = useAppTheme();
  const c = t.colors;
  const insets = useSafeAreaInsets();
  const drop = useAwardDrop();

  useEffect(() => {
    if (!drop) return;
    const timer = setTimeout(() => dismissDrop(drop.key), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [drop]);

  if (!drop) return null;
  const name = awardName(drop.id);
  const tier = tierName(drop.level);
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Animated.View key={drop.key} entering={SlideInUp.springify().damping(16)} exiting={SlideOutUp.duration(260)} style={styles.slot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${tr('awards.unlocked')}: ${name}, ${tier}`}
          onPress={() => {
            dismissDrop(drop.key);
            if (openOnTap) router.push('/awards');
          }}
          style={[styles.card, { borderColor: tierColor(drop.level) }]}>
          <BlurView intensity={50} tint={c.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surface }]} />
          <AwardBadge id={drop.id} level={drop.level} size="sm" />
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="overline" style={{ color: tierColor(drop.level) }}>
              {tr('awards.unlocked')}
            </Text>
            <Text variant="bodyStrong" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {drop.more > 0 ? `${tier} · ${tr('awards.andMore', { count: drop.more })}` : tier}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 1001 },
  slot: { width: '100%', maxWidth: 460 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
});
