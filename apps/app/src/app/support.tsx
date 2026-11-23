import { router } from 'expo-router';
import { Linking, View } from 'react-native';

import { InfoPage } from '@/components/InfoPage';
import { useT } from '@/i18n';
import { Button } from '@/ui';

/** Set EXPO_PUBLIC_SUPPORT_EMAIL to show an "Email us" button. */
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;

export default function Support() {
  const tr = useT();
  return (
    <InfoPage
      title="pages.support.title"
      intro="pages.support.intro"
      sections={[
        ['pages.support.accountTitle', 'pages.support.account'],
        ['pages.support.gamesTitle', 'pages.support.games'],
        ['pages.support.reportTitle', 'pages.support.report'],
        ['pages.support.bugTitle', 'pages.support.bug'],
      ]}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" title={tr('pages.support.askForum')} onPress={() => router.push({ pathname: '/forum', params: { category: 'app' } })} />
        {SUPPORT_EMAIL ? <Button size="sm" variant="secondary" title={tr('pages.support.email')} onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} /> : null}
        <Button size="sm" variant="secondary" title={tr('more.fairPlay')} onPress={() => router.push('/fair-play')} />
      </View>
    </InfoPage>
  );
}
