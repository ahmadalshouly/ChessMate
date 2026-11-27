import { Platform, View } from 'react-native';

import { ToggleRow } from '@/features/profile/controls';
import { formatDateTime, useT } from '@/i18n';
import { Text } from '@/ui';

import { setCookieConsent, useCookieConsent } from './cookieConsent';

/** The cookie choices, shown in Settings → Privacy and on the cookie policy page. */
export function CookiePreferences() {
  const tr = useT();
  const consent = useCookieConsent();
  return (
    <View style={{ gap: 4 }}>
      <ToggleRow title={tr('cookies.prefs.necessary')} detail={tr('cookies.prefs.necessaryDetail')} value disabled onChange={() => undefined} />
      <ToggleRow
        title={tr('cookies.prefs.analytics')}
        detail={tr('cookies.prefs.analyticsDetail')}
        value={consent.analytics}
        onChange={(analytics) => setCookieConsent({ analytics })}
      />
      <ToggleRow
        title={tr('cookies.prefs.externalMedia')}
        detail={tr(Platform.OS === 'web' ? 'cookies.prefs.externalMediaDetail' : 'cookies.prefs.externalMediaDetailApp')}
        value={consent.externalMedia}
        onChange={(externalMedia) => setCookieConsent({ externalMedia })}
      />
      <Text variant="caption" tone="muted">
        {tr('cookies.prefs.noTracking')}
      </Text>
      {consent.decidedAt ? (
        <Text variant="caption" tone="tertiary">
          {tr('cookies.prefs.savedAt', { date: formatDateTime(consent.decidedAt) })}
        </Text>
      ) : null}
    </View>
  );
}
