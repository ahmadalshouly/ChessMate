import { NOTIFICATION_KINDS, NOTIFICATION_KIND_INFO, type NotificationKind } from '@chessmate/core';
import { Stack } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { useT, type TKey } from '@/i18n';
import { useNotifications } from '@/lib/notifications';

const QUIET_PRESETS = [
  { startMin: 22 * 60, endMin: 7 * 60 },
  { startMin: 23 * 60, endMin: 8 * 60 },
  { startMin: 9 * 60, endMin: 17 * 60 },
];

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default function NotificationSettings() {
  const t = useTheme();
  const tr = useT();
  const kindLabel = (k: NotificationKind) => tr(`notifications.kinds.${k}.label` as TKey);
  const kindDescription = (k: NotificationKind) => tr(`notifications.kinds.${k}.description` as TKey);
  const range = (startMin: number, endMin: number) => tr('notifications.settings.range', { start: hhmm(startMin), end: hhmm(endMin) });
  const { prefs, updatePrefs, push, turnOnPush, turnOffPush, sendTest, offline } = useNotifications();
  const pushOn = push.state === 'enabled';

  const toggle = (kind: NotificationKind, channel: 'inApp' | 'push', value: boolean) => void updatePrefs({ kinds: { [kind]: { [channel]: value } } });
  const setQuiet = (patch: Record<string, unknown>) =>
    void updatePrefs({ quietHours: { ...patch, tzOffsetMin: -new Date().getTimezoneOffset() } });

  // Monochrome switches: accent track when on, thumb in the opposite tone (web needs its own props).
  const switchColors = {
    trackColor: { false: t.border, true: t.accent },
    thumbColor: t.scheme === 'dark' ? t.onAccent : '#FFFFFF',
    ios_backgroundColor: t.border,
    ...({ activeThumbColor: t.scheme === 'dark' ? t.onAccent : '#FFFFFF', activeTrackColor: t.accent } as object),
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('notifications.settings.title') }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          <Card>
            <Label size={18} bold>
              {tr('notifications.settings.pushTitle')}
            </Label>
            {push.state === 'enabled' && <Label muted>{tr('notifications.settings.pushOn')}</Label>}
            {push.state === 'unknown' && <Label muted>{tr('notifications.settings.pushUnknown')}</Label>}
            {push.state === 'denied' && <Label muted>{tr('notifications.settings.pushDenied')}</Label>}
            {push.state === 'unsupported' && <Label muted>{push.reason}</Label>}
            {push.state === 'error' && <Label muted>{tr('notifications.settings.pushError', { reason: push.reason })}</Label>}
            <View style={styles.actions}>
              {push.state === 'denied' ? (
                <Button title={tr('notifications.settings.openSettings')} onPress={() => void Linking.openSettings()} />
              ) : push.state !== 'unsupported' ? (
                <Button title={pushOn ? tr('notifications.settings.turnOff') : tr('notifications.settings.turnOn')} variant={pushOn ? 'secondary' : 'primary'} onPress={() => void (pushOn ? turnOffPush() : turnOnPush())} />
              ) : null}
              <Button title={tr('notifications.settings.sendTest')} variant="secondary" disabled={offline} onPress={() => void sendTest()} />
            </View>
          </Card>

          <Card>
            <Label size={18} bold>
              {tr('notifications.settings.whatTitle')}
            </Label>
            <View style={[styles.row, styles.headRow]}>
              <View style={{ flex: 1 }} />
              <View style={styles.col}>
                <Label muted size={12}>
                  {tr('notifications.settings.inApp')}
                </Label>
              </View>
              <View style={styles.col}>
                <Label muted size={12}>
                  {tr('notifications.settings.push')}
                </Label>
              </View>
            </View>
            {!prefs && <Label muted>{offline ? tr('notifications.settings.offline') : tr('common.loading')}</Label>}
            {prefs &&
              NOTIFICATION_KINDS.filter((k) => NOTIFICATION_KIND_INFO[k].userConfigurable).map((k) => (
                <View key={k} style={[styles.row, { borderTopColor: t.border }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Label bold>{kindLabel(k)}</Label>
                    <Label muted size={13}>
                      {kindDescription(k)}
                    </Label>
                  </View>
                  <View style={styles.col}>
                    <Switch accessibilityLabel={tr('notifications.settings.inAppA11y', { kind: kindLabel(k) })} value={prefs.kinds[k].inApp} onValueChange={(v) => toggle(k, 'inApp', v)} {...switchColors} />
                  </View>
                  <View style={styles.col}>
                    <Switch accessibilityLabel={tr('notifications.settings.pushA11y', { kind: kindLabel(k) })} value={prefs.kinds[k].push} onValueChange={(v) => toggle(k, 'push', v)} {...switchColors} />
                  </View>
                </View>
              ))}
          </Card>

          {prefs && (
            <Card>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Label size={18} bold>
                    {tr('notifications.settings.quiet')}
                  </Label>
                  <Label muted size={13}>
                    {tr('notifications.settings.quietBody')}
                  </Label>
                </View>
                <Switch accessibilityLabel={tr('notifications.settings.quiet')} value={prefs.quietHours.enabled} onValueChange={(v) => setQuiet({ enabled: v })} {...switchColors} />
              </View>
              {prefs.quietHours.enabled && (
                <View style={styles.presets}>
                  {QUIET_PRESETS.map((p) => {
                    const active = prefs.quietHours.startMin === p.startMin && prefs.quietHours.endMin === p.endMin;
                    return (
                      <View key={p.startMin} style={styles.preset}>
                        <Button title={range(p.startMin, p.endMin)} variant={active ? 'primary' : 'secondary'} onPress={() => setQuiet({ startMin: p.startMin, endMin: p.endMin })} />
                      </View>
                    );
                  })}
                  {!QUIET_PRESETS.some((p) => p.startMin === prefs.quietHours.startMin && p.endMin === prefs.quietHours.endMin) && (
                    <Label muted>
                      {tr('notifications.settings.custom', { range: range(prefs.quietHours.startMin, prefs.quietHours.endMin) })}
                    </Label>
                  )}
                </View>
              )}
            </Card>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'transparent' },
  headRow: { paddingVertical: 0 },
  col: { width: 64, alignItems: 'center' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {},
});
