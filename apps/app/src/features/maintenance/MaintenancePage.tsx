import { countdownParts } from '@chessmate/core';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TextLink } from '@/components/auth/AuthShell';
import { Logo } from '@/components/shell/Logo';
import { Button, Card, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { Text, useAppTheme } from '@/ui';

import { recheckMaintenance, type MaintenanceInfo } from './useMaintenance';

/** Days, hours, minutes and seconds until `endsAt`, ticking once a second. Asks the server again when it runs out. */
function Countdown({ endsAt, autoEnd }: { endsAt: number; autoEnd: boolean }) {
  const tr = useT();
  const c = useAppTheme().colors;
  const [now, setNow] = useState(Date.now);
  const asked = useRef(false);
  const p = countdownParts(endsAt, now);
  useEffect(() => {
    if (p.done) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [p.done]);
  useEffect(() => {
    if (p.done && !asked.current) {
      asked.current = true;
      void recheckMaintenance();
    }
  }, [p.done]);
  if (p.done) {
    return (
      <Text variant="subheading" align="center" tone="muted">
        {tr('maintenance.anyMoment')}
      </Text>
    );
  }
  const cells: { value: number; label: string }[] = [
    ...(p.days
      ? [
          {
            value: p.days,
            label: tr('maintenance.units.days', { count: p.days }),
          },
        ]
      : []),
    {
      value: p.hours,
      label: tr('maintenance.units.hours', { count: p.hours }),
    },
    {
      value: p.minutes,
      label: tr('maintenance.units.minutes', { count: p.minutes }),
    },
    {
      value: p.seconds,
      label: tr('maintenance.units.seconds', { count: p.seconds }),
    },
  ];
  return (
    <View style={{ gap: 12, alignItems: 'center' }}>
      <Text variant="overline" tone="muted" align="center">
        {tr(autoEnd ? 'maintenance.opensIn' : 'maintenance.backIn')}
      </Text>
      {/* Clock order reads left to right in every language. */}
      <View style={[styles.cells, { direction: 'ltr' }]} accessibilityRole="timer">
        {cells.map((cell) => (
          <View key={cell.label} style={[styles.cell, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Text variant="figure">{String(cell.value).padStart(2, '0')}</Text>
            <Text variant="caption" tone="muted">
              {cell.label}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption" tone="tertiary" align="center">
        {new Date(endsAt).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </Text>
    </View>
  );
}

/**
 * The page the public sees on the web while maintenance mode is on. Admins see
 * it too when they open /maintenance, as a preview, with a way back in.
 */
export function MaintenancePage({ info, preview }: { info: MaintenanceInfo | null; preview: boolean }) {
  const tr = useT();
  const { status, user, signOut } = useAuth();
  const title = info?.title || tr('maintenance.defaultTitle');
  const description = info?.description || tr('maintenance.defaultBody');
  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.scroll}>
          <View style={styles.column}>
            <View style={{ alignItems: 'center' }}>
              <Logo size={44} />
            </View>
            <View style={{ gap: 10 }}>
              <Text variant="title" align="center" accessibilityRole="header">
                {title}
              </Text>
              <Text tone="muted" align="center">
                {description}
              </Text>
            </View>
            {info?.endsAt ? <Countdown endsAt={info.endsAt} autoEnd={info.autoEnd} /> : null}
            {preview ? (
              <Card>
                <View style={{ gap: 12 }}>
                  <Text variant="caption" tone="muted">
                    {tr('admin.maintenance.previewNote')}
                  </Text>
                  <Button title={tr('admin.maintenance.openSite')} onPress={() => router.replace('/')} />
                  <Button title={tr('admin.maintenance.settings')} variant="secondary" onPress={() => router.push('/admin/maintenance')} />
                </View>
              </Card>
            ) : (
              <View style={styles.footer}>
                {status === 'signedIn' && user ? (
                  <Text variant="caption" tone="tertiary" align="center">
                    {tr('maintenance.signedInAs', { name: user.username })} <TextLink title={tr('maintenance.signOut')} onPress={() => void signOut()} />
                  </Text>
                ) : (
                  <Text variant="caption" tone="tertiary" align="center">
                    <TextLink title={tr('maintenance.staffSignIn')} onPress={() => router.push('/sign-in')} />
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    paddingVertical: 32,
  },
  column: { width: '100%', maxWidth: 520, gap: 28 },
  cells: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  cell: {
    minWidth: 76,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  footer: { alignItems: 'center', gap: 8 },
});
