import { router, useSegments } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { Button, GlassView, Text } from '@/ui';

import { cookieConsentLoaded, setCookieConsent, useCookieConsent } from './cookieConsent';

/**
 * First-visit privacy notice, on the web and in the apps. "Only necessary" and
 * "Accept all" carry the same weight, nothing optional (analytics, external media)
 * runs before a choice, and the choice can be changed later in Settings → Privacy
 * or on the cookie policy page. The apps never embed third-party players, so their
 * text only speaks of analytics.
 */
export function CookieBanner() {
  const tr = useT();
  const consent = useCookieConsent();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  if (consent.decided || !cookieConsentLoaded()) return null;
  // The policy page has the full choices itself.
  if (segments[0] === 'cookies') return null;
  const web = Platform.OS === 'web';
  return (
    <View style={[styles.wrap, { paddingBottom: 16 + insets.bottom }]} pointerEvents="box-none">
      <GlassView radius="xl" padding="lg" elevation="lg" style={styles.card} accessibilityRole="alert" accessibilityLabel={tr('cookies.banner.title')}>
        <Text variant="heading">{tr('cookies.banner.title')}</Text>
        <Text tone="muted" style={{ lineHeight: 21 }}>
          {tr(web ? 'cookies.banner.body' : 'cookies.banner.bodyApp')}
        </Text>
        <View style={styles.actions}>
          <Button variant="secondary" title={tr('cookies.banner.necessary')} onPress={() => setCookieConsent({ externalMedia: false, analytics: false })} style={styles.action} />
          <Button variant="secondary" title={tr('cookies.banner.acceptAll')} onPress={() => setCookieConsent({ externalMedia: web, analytics: true })} style={styles.action} />
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
