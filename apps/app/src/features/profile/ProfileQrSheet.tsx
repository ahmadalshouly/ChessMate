import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { QrCode } from '@/components/QrCode';
import { useT } from '@/i18n';
import { profileLink, shareLink } from '@/lib/links';
import { Button, Modal, Text, useAppTheme } from '@/ui';

/**
 * A player's profile as a QR code. Scanning it with any phone camera opens the
 * profile, where the other player can add them as a friend.
 */
export function ProfileQrSheet({ visible, onClose, username, displayName }: { visible: boolean; onClose: () => void; username: string; displayName: string }) {
  const t = useAppTheme();
  const tr = useT();
  const link = profileLink(username);
  const [status, setStatus] = useState<string | null>(null);
  return (
    <Modal visible={visible} onClose={onClose} presentation="sheet">
      <View style={styles.center}>
        <Text variant="heading">{displayName}</Text>
        <Text tone="muted">@{username}</Text>
        <View style={[styles.frame, { borderColor: t.colors.border }]}>
          <QrCode value={link} size={232} />
        </View>
        <Text tone="muted" align="center" style={{ maxWidth: 320 }}>
          {tr('qr.scanHint')}
        </Text>
        <Text variant="caption" tone="tertiary" selectable numberOfLines={1}>
          {link}
        </Text>
        {status && <Text variant="caption">{status}</Text>}
      </View>
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button variant="ghost" title={tr('game.close')} fullWidth onPress={onClose} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={tr('qr.share')}
            fullWidth
            leftIcon={<Ionicons name="share-outline" size={16} color={t.colors.onAccent} />}
            onPress={async () => {
              const r = await shareLink(link, tr('qr.shareMessage', { name: displayName }));
              setStatus(r === 'copied' ? tr('qr.copied') : r === 'failed' ? tr('qr.shareFailed') : null);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 8 },
  frame: { padding: 12, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, backgroundColor: '#fff', marginVertical: 8 },
  actions: { flexDirection: 'row', gap: 10 },
});
