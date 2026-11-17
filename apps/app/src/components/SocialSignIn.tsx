import { useState } from 'react';
import { View } from 'react-native';

import { SearchField } from '@/components/social';
import { Button, Card, Label } from '@/components/ui';
import { devIdentity, setSocialIdentity } from '@/lib/social/session';
import { useT } from '@/i18n';

/**
 * Shown on social screens until sign-in is wired in. In development it lets
 * you pick a test username (the dev server creates the account on first use);
 * production builds only ask the user to sign in.
 */
export function DevSignIn() {
  const [name, setName] = useState('');
  const tr = useT();
  const valid = /^[A-Za-z0-9_-]{3,20}$/.test(name.trim());
  return (
    <Card>
      <Label size={18} bold>
        {tr('social.devSignIn.title')}
      </Label>
      {__DEV__ ? (
        <View style={{ gap: 10 }}>
          <Label muted>{tr('social.devSignIn.dev')}</Label>
          <SearchField placeholder={tr('social.devSignIn.placeholder')} value={name} onChangeText={setName} maxLength={20} />
          <Button title={tr('common.continue')} disabled={!valid} onPress={() => setSocialIdentity(devIdentity(name))} />
        </View>
      ) : (
        <Label muted>{tr('social.devSignIn.prod')}</Label>
      )}
    </Card>
  );
}
