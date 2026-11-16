import { formatClock, type PlayerInfo } from '@chessmate/core';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';

export function PlayerBar({ player, ms, active, offline }: { player: PlayerInfo | null; ms: number | null; active: boolean; offline?: boolean }) {
  const t = useTheme();
  const low = ms !== null && ms < 20_000;
  return (
    <View style={styles.row}>
      <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
        {player ? `${player.name} (${player.rating}${player.provisional ? '?' : ''})` : '...'}
        {offline ? '  · reconnecting' : ''}
      </Text>
      {ms !== null && (
        <View style={[styles.clock, { backgroundColor: active ? (low ? t.danger : t.accent) : t.surface, borderColor: t.glassBorder }]}>
          <Text style={[styles.clockText, { color: active ? (low ? '#FFF' : t.onAccent) : t.text }]}>{formatClock(ms)}</Text>
        </View>
      )}
    </View>
  );
}

/** Re-renders every 100 ms while `running` so clocks tick smoothly. */
export function useTicker(running: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setN((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [running]);
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 12 },
  name: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  clock: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, minWidth: 84, alignItems: 'center' },
  clockText: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
