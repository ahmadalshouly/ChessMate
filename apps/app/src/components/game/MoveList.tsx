import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { useT } from '@/i18n';
import { GlassView, Text, useAppTheme } from '@/ui';

/**
 * Numbered move table for the game screen (1. e4 e5 / 2. Nf3 …). The shown
 * move is highlighted; tap any move to look at that position.
 */
export function MoveList({
  sans,
  shown,
  onSelect,
  header,
  empty,
}: {
  sans: string[];
  /** Ply on the board (1-based), 0 for the start. */
  shown: number;
  onSelect: (ply: number) => void;
  /** Offers and notices pinned above the moves. */
  header?: ReactNode;
  empty?: string;
}) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const scroll = useRef<ScrollViewInstance>(null);
  const rows = useMemo(() => {
    const out: { no: number; w: number; b: number | null }[] = [];
    for (let i = 0; i < sans.length; i += 2) out.push({ no: i / 2 + 1, w: i + 1, b: i + 1 < sans.length ? i + 2 : null });
    return out;
  }, [sans]);

  useEffect(() => {
    if (shown === sans.length) scroll.current?.scrollToEnd({ animated: true });
  }, [sans.length, shown]);

  const cell = (ply: number | null) => {
    if (ply === null) return <View style={styles.cell} />;
    const on = ply === shown;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => onSelect(ply)}
        style={({ pressed }) => [styles.cell, on && { backgroundColor: c.accent }, !on && pressed && { backgroundColor: c.surfacePressed }]}>
        <Text variant="mono" color={on ? c.onAccent : c.text} style={styles.san} numberOfLines={1}>
          {sans[ply - 1]}
        </Text>
      </Pressable>
    );
  };

  return (
    <GlassView radius="lg" elevation="none" flat style={styles.box}>
      {header}
      <ScrollView ref={scroll} contentContainerStyle={styles.list}>
        {rows.length === 0 ? (
          <Text tone="muted" style={{ padding: 6 }}>
            {empty ?? tr('game.noMoves')}
          </Text>
        ) : (
          rows.map((r) => (
            <View key={r.no} style={[styles.row, r.no % 2 === 0 && { backgroundColor: c.surfaceSunken }]}>
              <Text variant="mono" tone="tertiary" style={styles.no}>
                {r.no}.
              </Text>
              {cell(r.w)}
              {cell(r.b)}
            </View>
          ))
        )}
      </ScrollView>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, overflow: 'hidden' },
  list: { padding: 6 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, minHeight: 30 },
  no: { width: 40, textAlign: 'right', paddingRight: 8, fontSize: 12.5 },
  cell: { flex: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  san: { fontSize: 14 },
});
