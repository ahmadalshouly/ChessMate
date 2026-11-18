import type { AppNotification } from '@chessmate/core';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { useTheme } from '@/constants/theme';
import { useT } from '@/i18n';
import { notificationText } from '@/i18n/notifications';

import { KIND_GLYPH, timeAgo } from './format';

export function NotificationRow({ n, onPress, onRemove }: { n: AppNotification; onPress: () => void; onRemove: () => void }) {
  const t = useTheme();
  const tr = useT();
  const unread = n.readAt === null;
  const { title, body } = notificationText(n);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? `${tr('notifications.unread')} ` : ''}${title}. ${body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderColor: t.border, backgroundColor: pressed ? t.border : 'transparent' }]}>
      <View style={[styles.avatar, { backgroundColor: unread ? t.accent : t.surface, borderColor: t.glassBorder }]}>
        <Text style={{ color: unread ? t.onAccent : t.muted, fontSize: 16, fontWeight: '700' }}>{KIND_GLYPH[n.kind]}</Text>
      </View>
      <View style={styles.text}>
        <View style={styles.titleLine}>
          <Text numberOfLines={1} style={[styles.title, { color: t.text, fontWeight: unread ? '700' : '500' }]}>
            {title}
          </Text>
          <Text style={[styles.time, { color: t.muted }]}>{timeAgo(n.createdAt)}</Text>
        </View>
        <Text numberOfLines={2} style={{ color: unread ? t.text : t.muted, fontSize: 14, lineHeight: 19 }}>
          {body}
        </Text>
      </View>
      {unread && <View style={[styles.dot, { backgroundColor: t.accent }]} />}
      <Pressable accessibilityRole="button" accessibilityLabel={tr('notifications.remove')} hitSlop={8} onPress={onRemove} style={styles.remove}>
        <Text style={{ color: t.muted, fontSize: 18 }}>×</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  text: { flex: 1, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { flex: 1, fontSize: 15 },
  time: { fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  remove: { paddingHorizontal: 4 },
});
