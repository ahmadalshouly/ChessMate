import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { StreamerLive } from '@chessmate/core';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { Text, useAppTheme } from '@/ui';

import { PLATFORM_ICON, openLink } from './components';

/** A live stream's preview picture (or a plain panel) with a play button that opens the platform. */
export function StreamPreview({ live, width }: { live: StreamerLive; width: number }) {
  const tr = useT();
  const t = useAppTheme();
  const height = Math.round((width * 9) / 16);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tr('watch.openOn', { platform: tr(`watch.platforms.${live.platform}`) })}
      onPress={() => openLink(live.url)}
      style={{ width, height, borderRadius: 14, overflow: 'hidden', backgroundColor: t.colors.surfaceSunken }}>
      {live.thumbnail ? <Image source={{ uri: live.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: live.thumbnail ? 'rgba(0,0,0,0.25)' : 'transparent' }]}>
        <View style={[styles.play, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <MaterialCommunityIcons name="play" size={34} color="#fff" />
        </View>
        {!live.thumbnail ? (
          <View style={styles.platform}>
            <MaterialCommunityIcons name={PLATFORM_ICON[live.platform]} size={18} color={t.colors.muted} />
            <Text variant="caption" tone="muted">
              {tr(`watch.platforms.${live.platform}`)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  play: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  platform: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
