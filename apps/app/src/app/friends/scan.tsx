import { usernameFromLink } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { useT } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { Button, GlassView, Text, useAppTheme } from '@/ui';

/**
 * Scan a friend's ChessMate QR code with the camera. A profile code opens that
 * player's profile (with Add friend); anything else shows a short hint and
 * keeps scanning.
 */
export default function ScanQr() {
  const t = useAppTheme();
  const tr = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);
  // The camera fires many events per second; handle only the first good one.
  const handled = useRef(false);
  const lastBad = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      handled.current = false;
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const onScanned = ({ data }: BarcodeScanningResult) => {
    if (handled.current) return;
    const name = usernameFromLink(data ?? '');
    if (!name) {
      if (lastBad.current !== data) {
        lastBad.current = data;
        setError(tr('qr.scanNotProfile'));
      }
      return;
    }
    handled.current = true;
    setError(null);
    haptic('move');
    router.replace({ pathname: '/profile/[username]', params: { username: name } });
  };

  let body;
  if (!permission) {
    body = null;
  } else if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    body = (
      <GlassView padding="lg" radius="xl" style={{ alignItems: 'center', gap: t.space.md }}>
        <Ionicons name="camera-outline" size={36} color={t.colors.text} />
        <Text variant="heading" align="center">
          {tr('qr.cameraTitle')}
        </Text>
        <Text tone="muted" align="center">
          {blocked ? tr('qr.cameraBlocked') : tr('qr.cameraBody')}
        </Text>
        {blocked && Platform.OS !== 'web' ? (
          <Button title={tr('qr.openSettings')} onPress={() => void Linking.openSettings()} />
        ) : (
          <Button title={tr('qr.allowCamera')} onPress={() => void requestPermission()} />
        )}
        <Button variant="ghost" title={tr('qr.pasteInstead')} onPress={() => router.replace('/friends/add')} />
      </GlassView>
    );
  } else {
    body = (
      <>
        <View style={styles.cameraWrap}>
          {focused && (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onScanned}
            />
          )}
          <View pointerEvents="none" style={styles.reticle} />
        </View>
        <Text tone={error ? 'danger' : 'muted'} align="center">
          {error ?? tr('qr.scanAim')}
        </Text>
        <Button variant="secondary" title={tr('qr.pasteInstead')} onPress={() => router.replace('/friends/add')} />
      </>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('qr.scanTitle') }} />
      <View style={styles.page}>
        <View style={[styles.inner, { gap: t.space.lg }]}>{body}</View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH },
  cameraWrap: { width: '100%', aspectRatio: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  reticle: { width: '62%', aspectRatio: 1, borderRadius: 20, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
});
