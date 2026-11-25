import { AD_SPOT_INFO, type AdSpotId } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { dirIcon, useT } from '@/i18n';
import { adImageUrl } from '@/lib/adsApi';
import { GlassView, Text, useAppTheme } from '@/ui';

import { countClick, countView, useAd } from './store';

/**
 * A sponsored spot. Renders **nothing at all** unless staff switched this spot
 * on and a placement is live, so a screen can mount one unconditionally and it
 * costs nothing while the spot is unsold.
 *
 * Three shapes, taken from AD_SPOT_INFO so the app and the console always
 * agree: `wide` runs the full width of a content column, `card` sits among
 * other cards, and `compact` is one small line for a crowded card.
 *
 * The label says "Sponsored" in the player's language, because an ad has to be
 * recognisable as one.
 */
export function AdSpot({
  spot,
  style,
  interactive = true,
}: {
  spot: AdSpotId;
  style?: StyleProp<ViewStyle>;
  /**
   * False where the spot sits inside something that cannot be tapped (the
   * start-of-game handshake passes touches through to the board). The spot
   * still shows, and still counts as seen, but it does not open the link.
   */
  interactive?: boolean;
}) {
  const ad = useAd(spot);
  const t = useAppTheme();
  const tr = useT();
  const id = ad?.id;
  useEffect(() => {
    if (id) countView(id);
  }, [id]);
  if (!ad) return null;

  const form = AD_SPOT_INFO[spot].form;
  const image = ad.image ? adImageUrl(ad.image) : null;
  const tappable = interactive && !!ad.url;
  const open = () => {
    if (!ad.url) return;
    countClick(ad.id);
    void Linking.openURL(ad.url).catch(() => {});
  };

  const body =
    form === 'compact' ? (
      <View style={[styles.compact, { borderColor: t.colors.glassBorder, backgroundColor: t.colors.surfaceSunken }]}>
        {image ? (
          <View style={[styles.compactImage, { borderColor: t.colors.border }]}>
            <Image source={{ uri: image }} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
          </View>
        ) : null}
        <View style={styles.compactText}>
          <Text variant="caption" numberOfLines={1}>
            {ad.title}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {`${tr('ads.sponsored')} · ${ad.sponsor}`}
          </Text>
        </View>
        {tappable ? <Ionicons name={dirIcon('chevron-forward')} size={14} color={t.colors.muted} style={styles.chevron} /> : null}
      </View>
    ) : (
      <GlassView radius="xl" padding="lg" flat style={[styles.box, { borderColor: t.colors.border }]}>
        <View style={[form === 'wide' ? styles.innerWide : styles.innerCard, { gap: t.space.lg }]}>
          {image && (
            <View style={[styles.imageBox, form === 'wide' ? styles.imageWide : styles.imageCard, { borderColor: t.colors.border }]}>
              <Image source={{ uri: image }} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
            </View>
          )}
          <View style={[styles.textBox, { gap: 4 }]}>
            <Text variant="overline" tone="tertiary">
              {tr('ads.sponsored')}
            </Text>
            <Text variant="heading" numberOfLines={2}>
              {ad.title}
            </Text>
            {ad.body ? (
              <Text variant="body" tone="muted" numberOfLines={3}>
                {ad.body}
              </Text>
            ) : null}
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {ad.sponsor}
            </Text>
          </View>
          {tappable ? <Ionicons name={dirIcon('chevron-forward')} size={22} color={t.colors.muted} style={styles.chevron} /> : null}
        </View>
      </GlassView>
    );

  if (!tappable) {
    return (
      <View style={style} accessible accessibilityLabel={`${tr('ads.sponsored')}: ${ad.title}. ${ad.sponsor}`}>
        {body}
      </View>
    );
  }
  return (
    <View style={style}>
      <Pressable
        accessibilityRole="link"
        // Screen readers hear that it is an ad before the sponsor's own words.
        accessibilityLabel={`${tr('ads.sponsored')}: ${ad.title}. ${ad.sponsor}`}
        onPress={open}
        style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
        {body}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  // The minimum heights are what make a sponsor read as a banner rather than
  // as one more list row, which is what they are paying for.
  innerWide: { flexDirection: 'row', alignItems: 'center', minHeight: 96, minWidth: 0 },
  innerCard: { flexDirection: 'column', alignItems: 'flex-start', minHeight: 132, minWidth: 0 },
  textBox: { flexShrink: 1, flexGrow: 1, minWidth: 0 },
  // A white plate behind the logo, so logos made for light backgrounds still read in dark mode.
  imageBox: { backgroundColor: '#fff', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', padding: 8, flexShrink: 0 },
  imageWide: { width: 132, height: 80 },
  imageCard: { width: 196, height: 72, alignSelf: 'flex-start' },
  image: { width: '100%', height: '100%' },
  chevron: { flexShrink: 0 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
  compactImage: { width: 44, height: 26, backgroundColor: '#fff', borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', padding: 3, flexShrink: 0 },
  compactText: { flexShrink: 1, flexGrow: 1, minWidth: 0 },
});
