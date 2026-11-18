import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { useT } from '@/i18n';
import { Text, useAppTheme } from '@/ui';

import { GameIcon } from './ActionBar';
import { STRIP_HEIGHT } from './GameLayout';

/**
 * The moves in one scrolling row above the board (1. e4 e5 2. Nf3 …). The
 * shown move is highlighted; tap one to look at that position, and the Live
 * chip at the end brings the board back to the game.
 */
export function MoveStrip({ sans, shown, onSelect, onLive, empty }: { sans: string[]; shown: number; onSelect: (ply: number) => void; onLive?: () => void; empty?: string }) {
  const c = useAppTheme().colors;
  const tr = useT();
  const scroll = useRef<ScrollViewInstance>(null);
  const live = shown === sans.length;

  useEffect(() => {
    if (live) scroll.current?.scrollToEnd({ animated: true });
  }, [sans.length, live]);

  return (
    <View style={[styles.strip, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {sans.length === 0 ? (
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ paddingHorizontal: 8 }}>
            {empty ?? tr('game.noMoves')}
          </Text>
        ) : (
          sans.map((san, i) => {
            const ply = i + 1;
            const on = ply === shown;
            return (
              <View key={ply} style={styles.item}>
                {i % 2 === 0 && (
                  <Text variant="mono" tone="tertiary" style={styles.no}>
                    {i / 2 + 1}.
                  </Text>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => onSelect(ply)}
                  style={({ pressed }) => [styles.move, on && { backgroundColor: c.accent }, !on && pressed && { backgroundColor: c.surfacePressed }]}>
                  <Text variant="mono" color={on ? c.onAccent : c.text} style={styles.san}>
                    {san}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
      {!live && onLive && (
        <Pressable accessibilityRole="button" accessibilityLabel={tr('game.backToLive')} onPress={onLive} style={[styles.live, { backgroundColor: c.accent }]}>
          <GameIcon name="skip-next" size={16} color={c.onAccent} />
          <Text variant="label" color={c.onAccent}>
            {tr('game.live')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { height: STRIP_HEIGHT, borderRadius: STRIP_HEIGHT / 2, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', paddingHorizontal: 4 },
  row: { alignItems: 'center', paddingHorizontal: 4 },
  item: { flexDirection: 'row', alignItems: 'center' },
  no: { fontSize: 12, marginStart: 6, marginEnd: 2 },
  move: { borderRadius: 12, paddingHorizontal: 7, height: 28, justifyContent: 'center' },
  san: { fontSize: 14 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 15, marginStart: 4 },
});
