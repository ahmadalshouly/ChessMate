import { View } from 'react-native';

import { InfoPage } from '@/components/InfoPage';
import { CookiePreferences } from '@/features/privacy/CookiePreferences';
import { useT } from '@/i18n';
import { GlassView, Text } from '@/ui';

/** Cookie policy, with the cookie choices at the top so they are one tap away. */
export default function Cookies() {
  const tr = useT();
  return (
    <InfoPage
      title="pages.cookies.title"
      intro="pages.cookies.intro"
      updated="pages.cookies.updated"
      sections={[
        ['pages.cookies.whatTitle', 'pages.cookies.what'],
        ['pages.cookies.necessaryTitle', 'pages.cookies.necessary'],
        ['pages.cookies.mediaTitle', 'pages.cookies.media'],
        ['pages.cookies.paymentsTitle', 'pages.cookies.payments'],
        ['pages.cookies.noTrackingTitle', 'pages.cookies.noTracking'],
        ['pages.cookies.durationTitle', 'pages.cookies.duration'],
        ['pages.cookies.changeTitle', 'pages.cookies.change'],
        ['pages.cookies.rightsTitle', 'pages.cookies.rights'],
      ]}>
      <GlassView radius="xl" padding="lg" style={{ gap: 8 }}>
        <View style={{ gap: 4 }}>
          <Text variant="heading">{tr('cookies.prefs.title')}</Text>
        </View>
        <CookiePreferences />
      </GlassView>
    </InfoPage>
  );
}
