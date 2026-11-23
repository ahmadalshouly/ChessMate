import { router, useSegments } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { Button, GlassView, Text } from '@/ui';

import { setCookieConsent, useCookieConsent } from './cookieConsent';

/**
 * First-visit cookie notice on the web. "Only necessary" and "Accept all" carry the
 * same weight, nothing optional loads before a choice, and the choice can be changed
 * later in Settings → Privacy or on the cookie policy page. Phones never embed
 * third-party players, so the apps don't show it.
 */
export function CookieBanner() {
  const tr = useT();
  const consent = useCookieConsent();
  const segments = useSegments();
  if (Platform.OS !== 'web' || consent.decided) return null;
  // The policy page has the full choices itself.
  if (segments[0] === 'cookies') return null;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GlassView radius="xl" padding="lg" elevation="lg" style={styles.card} accessibilityRole="alert" accessibilityLabel={tr('cookies.banner.title')}>
        <Text variant="heading">{tr('cookies.banner.title')}</Text>
        <Text tone="muted" style={{ lineHeight: 21 }}>
          {tr('cookies.banner.body')}
        </Text>
        <View style={styles.actions}>
          <Button variant="secondary" title={tr('cookies.banner.necessary')} onPress={() => setCookieConsent({ externalMedia: false })} style={styles.action} />
          <Button variant="secondary" title={tr('cookies.banner.acceptAll')} onPress={() => setCookieConsent({ externalMedia: true })} style={styles.action} />
        </View>
        <Button variant="ghost" size="sm" title={tr('cookies.banner.settings')} onPress={() => router.push('/cookies')} />
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, alignItems: 'center', zIndex: 1000 },
  card: { width: '100%', maxWidth: 560, gap: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexGrow: 1, flexBasis: 160 },
});
