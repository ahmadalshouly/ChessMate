import Constants from 'expo-constants';
import { router } from 'expo-router';
import { View } from 'react-native';

import { InfoPage } from '@/components/InfoPage';
import { useT } from '@/i18n';
import { Button, Text } from '@/ui';

export default function About() {
  const tr = useT();
  return (
    <InfoPage
      title="pages.about.title"
      intro="pages.about.intro"
      sections={[
        ['pages.about.playTitle', 'pages.about.play'],
        ['pages.about.learnTitle', 'pages.about.learn'],
        ['pages.about.belongTitle', 'pages.about.belong'],
        ['pages.about.fairTitle', 'pages.about.fair'],
      ]}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button size="sm" variant="secondary" title={tr('more.support')} onPress={() => router.push('/support')} />
        <Button size="sm" variant="secondary" title={tr('more.donate')} onPress={() => router.push('/donate')} />
        <Text variant="caption" tone="tertiary" style={{ marginStart: 'auto' }}>
          {tr('pages.about.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
        </Text>
      </View>
    </InfoPage>
  );
}
