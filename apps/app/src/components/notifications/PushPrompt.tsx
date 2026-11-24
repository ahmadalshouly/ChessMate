import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useNotifications } from '@/lib/notifications';
import { Button, GlassView, Text, useAppTheme } from '@/ui';

const KEY = 'chessmate.pushPrompt.dismissedAt';
/** After "Not now", ask again this much later. */
const AGAIN_MS = 14 * 24 * 60 * 60_000;

/**
 * Offers push notifications to signed-in players on a phone that was never
 * asked. Without it push stays off for everyone who does not find the switch
 * in Settings. The system prompt only appears after the player taps Turn on,
 * so a "No" in the system dialog is a real decision, not a surprise.
 */
export function PushPrompt() {
  const c = useAppTheme().colors;
  const tr = useT();
  const { status } = useAuth();
  const { pushPromptVisible, turnOnPush } = useNotifications();
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(KEY)
      .then((v) => live && setHidden(!!v && Date.now() - Number(v) < AGAIN_MS))
      .catch(() => live && setHidden(false));
    return () => {
      live = false;
    };
  }, []);

  if (hidden || status !== 'signedIn' || !pushPromptVisible) return null;

  const later = () => {
    setHidden(true);
    void AsyncStorage.setItem(KEY, String(Date.now())).catch(() => undefined);
  };
  const enable = async () => {
    setBusy(true);
    await turnOnPush().catch(() => undefined);
    setBusy(false);
  };

  return (
    <GlassView radius="xl" padding="lg" style={{ gap: 12 }}>
      <View style={styles.row}>
        <View style={[styles.icon, { borderColor: c.borderStrong }]}>
          <Ionicons name="notifications-outline" size={20} color={c.text} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{tr('notifications.prompt.title')}</Text>
          <Text tone="muted">{tr('notifications.prompt.body')}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button size="sm" title={tr('notifications.prompt.enable')} loading={busy} onPress={() => void enable()} />
        <Button size="sm" variant="ghost" title={tr('notifications.prompt.later')} onPress={later} />
      </View>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
