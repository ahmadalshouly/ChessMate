import Ionicons from '@expo/vector-icons/Ionicons';
import type { AdminAuditEntry } from '@chessmate/core';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatAgo, formatDateTime, translateOr, useT } from '@/i18n';
import { Text, useAppTheme } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<string, IconName> = {
  account: 'lock-closed-outline',
  chat: 'volume-mute-outline',
  player: 'person-outline',
  rating: 'trending-up-outline',
  role: 'key-outline',
  fairplay: 'shield-checkmark-outline',
  report: 'flag-outline',
  game: 'grid-outline',
  note: 'create-outline',
};

/** Short, readable summary of an entry's details (rating moves, role changes, mute length). */
function detailLine(e: AdminAuditEntry): string | null {
  const d = e.details as Record<string, unknown>;
  if (e.action === 'rating.adjust') return `${String(d.category)} ${String(d.before)} → ${String(d.after)}`;
  if (e.action === 'role.change' || e.action === 'player.rename') return `${String(d.from)} → ${String(d.to)}`;
  if (e.action === 'chat.mute' || e.action === 'report.chat_ban') return d.hours ? `${String(d.hours)} h` : null;
  if (e.action === 'account.close' && typeof d.refunds === 'number' && d.refunds > 0) return `${d.refunds} refunds · +${String(d.refundedPoints)}`;
  return null;
}

/** One line of the audit log: who did what to whom, why, and when. */
export function AuditRow({ e, last, compact }: { e: AdminAuditEntry; last?: boolean; compact?: boolean }) {
  const { colors: c } = useAppTheme();
  const tr = useT();
  const verb = translateOr(`admin.audit.actions.${e.action.replace('.', '_')}`, e.action);
  const actor = e.actorId === 'system' ? tr('admin.audit.system') : e.actorName;
  const detail = detailLine(e);
  const open = e.targetType === 'user' || e.targetType === 'case' ? `/admin/players/${encodeURIComponent(e.targetId ?? '')}` : e.targetType === 'game' ? `/admin/games/${encodeURIComponent(e.targetId ?? '')}` : null;
  return (
    <Pressable
      disabled={!open || !e.targetId}
      onPress={() => open && router.push(open as never)}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
        hovered && open && { backgroundColor: c.surfaceSunken },
      ]}>
      <View style={[styles.icon, { borderColor: c.border }]}>
        <Ionicons name={ICONS[e.action.split('.')[0]!] ?? 'ellipse-outline'} size={14} color={c.muted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={compact ? 2 : undefined}>
          <Text variant="bodyStrong">{actor}</Text>
          {` ${verb} `}
          {e.targetName ? <Text variant="bodyStrong">{e.targetName}</Text> : null}
        </Text>
        {e.reason || detail ? (
          <Text variant="caption" tone="muted" numberOfLines={compact ? 1 : undefined}>
            {[detail, e.reason].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" tone="tertiary" accessibilityLabel={formatDateTime(e.at)}>
        {compact ? formatAgo(e.at) : formatDateTime(e.at)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  icon: { width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
