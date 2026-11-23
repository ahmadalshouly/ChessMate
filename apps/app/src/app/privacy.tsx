import { router } from 'expo-router';

import { InfoPage } from '@/components/InfoPage';
import { useT } from '@/i18n';
import { Button } from '@/ui';

export default function Privacy() {
  const tr = useT();
  return (
    <InfoPage
      title="pages.privacy.title"
      intro="pages.privacy.intro"
      updated="pages.privacy.updated"
      sections={[
        ['pages.privacy.collectTitle', 'pages.privacy.collect'],
        ['pages.privacy.useTitle', 'pages.privacy.use'],
        ['pages.privacy.publicTitle', 'pages.privacy.public'],
        ['pages.privacy.paymentsTitle', 'pages.privacy.payments'],
        ['pages.privacy.choicesTitle', 'pages.privacy.choices'],
        ['pages.privacy.cookiesTitle', 'pages.privacy.cookies'],
        ['pages.privacy.deleteTitle', 'pages.privacy.delete'],
      ]}>
      <Button variant="secondary" title={tr('pages.cookies.title')} onPress={() => router.push('/cookies')} />
    </InfoPage>
  );
}
