import type { Presence, SocialUser } from '@chessmate/core';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type TextInputProps } from 'react-native';
import { Text, TextInput } from '@/ui/primitives';

import { useTheme } from '@/constants/theme';
import { formatAgo, translate } from '@/i18n';

/** Monochrome initial badge; no user images yet. */
export function Avatar({ user, size = 40, presence }: { user: SocialUser; size?: number; presence?: Presence | null }) {
  const t = useTheme();
  const letter = (user.displayName || user.username).charAt(0).toUpperCase();
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: t.surface, borderColor: t.glassBorder },
        ]}>
        <Text style={{ color: t.text, fontWeight: '700', fontSize: size * 0.42 }}>{letter}</Text>
      </View>
      {presence && presence.status !== 'offline' && <PresenceDot presence={presence} style={styles.dotCorner} />}
    </View>
  );
}

/** Solid dot = online, ring = playing. Shapes, not colour, carry the meaning. */
export function PresenceDot({ presence, style }: { presence: Presence; style?: object }) {
  const t = useTheme();
  const playing = presence.status === 'playing';
  return (
    <View
      accessibilityLabel={presenceLabel(presence)}
      style={[
        styles.dot,
        {
          backgroundColor: playing ? t.bg : t.text,
          borderColor: playing ? t.text : t.bg,
          borderWidth: playing ? 3 : 2,
        },
        style,
      ]}
    />
  );
}

export function presenceLabel(p: Presence | null | undefined): string {
  if (!p) return '';
  return translate(p.status === 'playing' ? 'social.presence.playing' : p.status === 'online' ? 'profile.online' : 'play.offline');
}

export function UserRow({
  user,
  presence,
  subtitle,
  onPress,
  right,
}: {
  user: SocialUser;
  presence?: Presence | null;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed && onPress ? 0.7 : 1 }]}>
      <Avatar user={user} presence={presence} />
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
          {user.displayName}
          {user.displayName !== user.username && <Text style={{ color: t.muted, fontWeight: '400' }}>  @{user.username}</Text>}
        </Text>
        {!!(subtitle ?? presenceLabel(presence)) && (
          <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
            {subtitle ?? presenceLabel(presence)}
          </Text>
        )}
      </View>
      {right && <View style={styles.rowRight}>{right}</View>}
    </Pressable>
  );
}

/** Compact pill button for list rows. */
export function Pill({ title, onPress, variant = 'secondary', disabled }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.accent : 'transparent';
  const fg = variant === 'primary' ? t.onAccent : variant === 'danger' ? t.danger : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: bg, borderColor: variant === 'primary' ? 'transparent' : t.border, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}>
      <Text style={{ color: fg, fontWeight: '600', fontSize: 14 }}>{title}</Text>
    </Pressable>
  );
}

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: string; badge?: number }[]; value: K; onChange: (k: K) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.tabs, { backgroundColor: t.surface, borderColor: t.glassBorder }]}>
      {tabs.map((tab) => {
        const on = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, on && { backgroundColor: t.accent }]}>
            <Text style={{ color: on ? t.onAccent : t.text, fontWeight: '600' }}>
              {tab.label}
              {tab.badge ? ` · ${tab.badge}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchField(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.muted}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      style={[styles.input, { color: t.text, backgroundColor: t.surface, borderColor: t.glassBorder }]}
    />
  );
}

/** "5m ago" in the current language. */
export const timeAgo = formatAgo;

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  dotCorner: { position: 'absolute', end: -2, bottom: -2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600' },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  tabs: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 4, gap: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
