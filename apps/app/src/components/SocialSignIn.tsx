import { useState } from 'react';
import { View } from 'react-native';

import { SearchField } from '@/components/social';
import { Button, Card, Label } from '@/components/ui';
import { devIdentity, setSocialIdentity } from '@/lib/social/session';

/**
 * Shown on social screens until sign-in is wired in. In development it lets
 * you pick a test username (the dev server creates the account on first use);
 * production builds only ask the user to sign in.
 */
export function DevSignIn() {
  const [name, setName] = useState('');
  const valid = /^[A-Za-z0-9_-]{3,20}$/.test(name.trim());
  return (
    <Card>
      <Label size={18} bold>
        Sign in to add friends
      </Label>
      {__DEV__ ? (
        <View style={{ gap: 10 }}>
          <Label muted>Development build: choose a test username. Use a different name on each device to try friends between them.</Label>
          <SearchField placeholder="Username (3 to 20 letters)" value={name} onChangeText={setName} maxLength={20} />
          <Button title="Continue" disabled={!valid} onPress={() => setSocialIdentity(devIdentity(name))} />
        </View>
      ) : (
        <Label muted>Friends, following and activity are available once you sign in.</Label>
      )}
    </Card>
  );
}
