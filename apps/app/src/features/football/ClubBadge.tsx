import { badgeInk, footballClub, type FootballClub } from '@chessmate/core';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

import { useT } from '@/i18n';
import { Text, useAppTheme } from '@/ui';

/** Shield outline in a 24 x 28 box. */
const SHIELD = 'M12 1.2 L22.4 4.2 V13 C22.4 19.8 17.8 24.4 12 26.8 C6.2 24.4 1.6 19.8 1.6 13 V4.2 Z';

/**
 * A club's badge: the licensed crest when the club has one, otherwise an original
 * shield in the club's colours with its short name (no club artwork is copied).
 * Short names are drawn from 30 px up; smaller shields show the colours only.
 */
export function ClubCrest({ club, size = 20 }: { club: FootballClub; size?: number }) {
  const c = useAppTheme().colors;
  const h = size;
  const w = (size * 24) / 28;
  if (club.logo) return <Image source={{ uri: club.logo }} style={{ width: w, height: h }} resizeMode="contain" accessibilityIgnoresInvertColors />;
  const [field, trim] = club.colors;
  const letters = size >= 30;
  const fontSize = club.short.length > 3 ? 5.6 : 7;
  return (
    <Svg width={w} height={h} viewBox="0 0 24 28">
      <Path d={SHIELD} fill={field} />
      <Rect x={1.6} y={5.6} width={20.8} height={3.6} fill={trim} />
      <Path d={SHIELD} fill="none" stroke={trim} strokeWidth={1.6} strokeLinejoin="round" />
      {/* Hairline in the theme's border colour, so white-on-white clubs still have an edge. */}
      <Path d={SHIELD} fill="none" stroke={c.borderStrong} strokeWidth={0.6} strokeLinejoin="round" />
      {letters && (
        <SvgText x={12} y={18.6} fontSize={fontSize} fontWeight="700" fill={badgeInk(field)} textAnchor="middle" letterSpacing={0.2}>
          {club.short}
        </SvgText>
      )}
    </Svg>
  );
}

/**
 * Football Mate tag next to a player's name. `compact` is the shield alone (player
 * cards over the board); otherwise a chip with the shield and the club's short name,
 * or its full name at `md`.
 */
export function ClubBadge({ club: id, compact, size = 'sm' }: { club: string | null | undefined; compact?: boolean; size?: 'sm' | 'md' }) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  const club = footballClub(id);
  if (!club) return null;
  const label = tr('football.supports', { club: club.name });
  const h = size === 'sm' ? 20 : 26;
  if (compact) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.compact}>
        <ClubCrest club={club} size={size === 'sm' ? 16 : 20} />
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.tag, { height: h, borderRadius: h / 2, borderColor: c.borderStrong, paddingStart: size === 'sm' ? 4 : 6, paddingEnd: size === 'sm' ? 7 : 10 }]}>
      <ClubCrest club={club} size={size === 'sm' ? 14 : 18} />
      <Text variant={size === 'sm' ? 'caption' : 'label'} numberOfLines={1}>
        {size === 'sm' ? club.short : club.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { flexShrink: 0, justifyContent: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0, borderWidth: StyleSheet.hairlineWidth * 2 },
});
