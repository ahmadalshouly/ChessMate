import type { TournamentSponsor } from '@chessmate/core';
import * as Linking from 'expo-linking';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { logoUrl } from '@/lib/tournamentsApi';
import { Text, useAppTheme } from '@/ui';

/**
 * "Presented by <logo> Sponsor": shown on the tournament card, page and games.
 * Tapping opens the sponsor's site when they have one.
 */
export function SponsorBadge({ sponsor, size = 'md' }: { sponsor: TournamentSponsor | null; size?: 'sm' | 'md' | 'lg' }) {
  const t = useAppTheme();
  const tr = useT();
  if (!sponsor) return null;
  const h = size === 'lg' ? 56 : size === 'md' ? 32 : 20;
  const body = (
    <View style={[styles.row, { gap: size === 'sm' ? 6 : 10 }]}>
      {size !== 'sm' && (
        <Text variant="caption" tone="muted">
          {tr('tournaments.presentedBy')}
        </Text>
      )}
      {sponsor.logoPath ? (
        <View style={[styles.logo, { height: h, borderRadius: h / 5, backgroundColor: '#fff', borderColor: t.colors.border }]}>
          <Image source={{ uri: logoUrl(sponsor.logoPath) }} style={{ height: h - 6, width: (h - 6) * 3 }} resizeMode="contain" accessibilityLabel={sponsor.name} />
        </View>
      ) : null}
      <Text variant={size === 'lg' ? 'heading' : size === 'md' ? 'label' : 'caption'} numberOfLines={1} style={{ flexShrink: 1 }}>
        {sponsor.name}
      </Text>
    </View>
  );
  if (!sponsor.url) return body;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={sponsor.name} onPress={() => void Linking.openURL(sponsor.url!)}>
      {({ pressed }) => <View style={{ opacity: pressed ? 0.7 : 1 }}>{body}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  logo: { paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
