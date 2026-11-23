import type { TournamentSponsor } from '@chessmate/core';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { logoUrl } from '@/lib/tournamentsApi';
import { Text, useAppTheme } from '@/ui';

/** Logo width / height, by logo URL, so a logo is measured once. */
const ratios = new Map<string, number>();
/** Until the logo is measured, and the widest a very long logo may be. */
const DEFAULT_RATIO = 3;
const MAX_RATIO = 5;

function useLogoRatio(uri: string | null): number {
  const [measured, setMeasured] = useState<{ uri: string; ratio: number } | null>(null);
  useEffect(() => {
    if (!uri || ratios.has(uri)) return;
    let live = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (!w || !h) return;
        const r = Math.min(MAX_RATIO, Math.max(0.5, w / h));
        ratios.set(uri, r);
        if (live) setMeasured({ uri, ratio: r });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [uri]);
  if (!uri) return DEFAULT_RATIO;
  return measured?.uri === uri ? measured.ratio : (ratios.get(uri) ?? DEFAULT_RATIO);
}

/**
 * "Presented by <logo> Sponsor": shown on the tournament card, page and games.
 * Always fits the space it is given: the logo box follows the logo's own
 * shape and shrinks with the row, the name shrinks its text a little and
 * then ends with "…", and "Presented by" is dropped first when space is
 * short (it is kept for screen readers). Tapping opens the sponsor's site
 * when they have one.
 */
export function SponsorBadge({
  sponsor,
  size = 'md',
  align = 'start',
}: {
  sponsor: TournamentSponsor | null;
  size?: 'sm' | 'md' | 'lg';
  /** Where the badge sits in the width it is given. */
  align?: 'start' | 'center';
}) {
  const t = useAppTheme();
  const tr = useT();
  const uri = sponsor?.logoPath ? logoUrl(sponsor.logoPath) : null;
  const ratio = useLogoRatio(uri);
  const [width, setWidth] = useState(0);
  if (!sponsor) return null;
  const h = size === 'lg' ? 56 : size === 'md' ? 32 : 20;
  const pad = 6;
  // Room for the logo: at most half the row (or its natural width), the rest for the name.
  const natural = (h - pad) * ratio + pad * 2;
  const logoW = width > 0 ? Math.min(natural, Math.max(h, width * (sponsor.name ? 0.5 : 1))) : natural;
  const imgH = Math.min(h - pad, (logoW - pad * 2) / ratio);
  // "Presented by" only when the row has room for it beside the logo and some of the name.
  const showLabel = size !== 'sm' && width > 0 && width >= logoW + 220;
  const body = (
    <View style={[styles.row, { gap: size === 'sm' ? 6 : 10 }]} accessible accessibilityLabel={`${tr('tournaments.presentedBy')} ${sponsor.name}`}>
      {showLabel && (
        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.label}>
          {tr('tournaments.presentedBy')}
        </Text>
      )}
      {uri ? (
        <View style={[styles.logo, { height: h, width: logoW, borderRadius: h / 5, backgroundColor: '#fff', borderColor: t.colors.border }]}>
          <Image source={{ uri }} style={{ height: imgH, width: logoW - pad * 2 }} resizeMode="contain" />
        </View>
      ) : null}
      <Text
        variant={size === 'lg' ? 'heading' : size === 'md' ? 'label' : 'caption'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={styles.name}>
        {sponsor.name}
      </Text>
    </View>
  );
  // The outer box takes the full width on offer and measures it; the badge sits inside it.
  return (
    <View style={[styles.space, { alignItems: align === 'center' ? 'center' : 'flex-start' }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {sponsor.url ? (
        <Pressable accessibilityRole="link" accessibilityLabel={sponsor.name} onPress={() => void Linking.openURL(sponsor.url!)} style={styles.press}>
          {({ pressed }) => <View style={[styles.press, { opacity: pressed ? 0.7 : 1 }]}>{body}</View>}
        </Pressable>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  space: { alignSelf: 'stretch', minWidth: 0 },
  // Never wider than the space: children shrink instead of overflowing.
  row: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0, maxWidth: '100%' },
  press: { flexShrink: 1, minWidth: 0, maxWidth: '100%' },
  label: { flexShrink: 0 },
  logo: { paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', flexShrink: 0 },
  name: { flexShrink: 1, minWidth: 0 },
});
