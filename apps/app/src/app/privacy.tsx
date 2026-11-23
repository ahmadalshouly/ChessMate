import { InfoPage } from '@/components/InfoPage';

export default function Privacy() {
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
        ['pages.privacy.deleteTitle', 'pages.privacy.delete'],
      ]}
    />
  );
}
