import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { STREAM_PLATFORMS, STREAMER_LIMITS, type StreamPlatform } from '@chessmate/core';
import { Pressable } from 'react-native';

import { useT } from '@/i18n';
import { Button, Chip, Row, Stack, Text, TextField, useAppTheme } from '@/ui';

import { PLATFORM_ICON } from './components';

export interface ChannelDraft {
  platform: StreamPlatform;
  url: string;
}

/** Edit a list of stream channels: platform and link, up to five. */
export function ChannelEditor({ value, onChange, error }: { value: ChannelDraft[]; onChange: (v: ChannelDraft[]) => void; error?: string | null }) {
  const tr = useT();
  const t = useAppTheme();
  const set = (i: number, patch: Partial<ChannelDraft>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <Stack gap="md">
      {value.map((ch, i) => (
        <Stack key={i} gap="xs">
          <Row gap="xs" wrap>
            {STREAM_PLATFORMS.map((p) => (
              <Chip key={p} label={tr(`watch.platforms.${p}`)} selected={ch.platform === p} onPress={() => set(i, { platform: p })} />
            ))}
          </Row>
          <Row gap="sm">
            <MaterialCommunityIcons name={PLATFORM_ICON[ch.platform]} size={22} color={t.colors.muted} />
            <TextField
              containerStyle={{ flex: 1 }}
              value={ch.url}
              onChangeText={(url) => set(i, { url })}
              placeholder={tr(`watch.platformHint.${ch.platform}`)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel={tr('watch.channelLink')}
            />
            {value.length > 1 && (
              <Pressable accessibilityRole="button" accessibilityLabel={tr('watch.removeChannel')} hitSlop={8} onPress={() => onChange(value.filter((_, j) => j !== i))}>
                <MaterialCommunityIcons name="close" size={20} color={t.colors.muted} />
              </Pressable>
            )}
          </Row>
        </Stack>
      ))}
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
      {value.length < STREAMER_LIMITS.channels && (
        <Button title={tr('watch.addChannel')} variant="ghost" size="sm" onPress={() => onChange([...value, { platform: 'twitch', url: '' }])} />
      )}
    </Stack>
  );
}

/** Day and time as editable text ("2026-03-14 15:00"), in the device's time zone. */
export const toLocalInput = (ms: number | null) => {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const fromLocalInput = (s: string): number | null => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};
