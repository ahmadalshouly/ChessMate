import { Children, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { AwardDropBanner } from '@/features/awards/AwardDropBanner';
import { useAppTheme } from '@/ui';

/**
 * The end-of-game result, full screen over a dimmed game: the card has the
 * whole screen, so the result, quick review and every button fit without
 * scrolling. Children after the first (the celebration) are drawn over the
 * whole screen and let touches through.
 */
export function ResultPopup({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const c = useAppTheme().colors;
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [card, ...effects] = Children.toArray(children);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel={tr('game.over.close')} onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} />
      <ScrollView
        pointerEvents="box-none"
        contentContainerStyle={[styles.center, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.cardBox}>{card}</View>
      </ScrollView>
      {effects.length > 0 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {effects}
        </View>
      )}
      {/* Awards this game unlocked drop in over the result. */}
      <AwardDropBanner openOnTap={false} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  cardBox: { width: '100%', maxWidth: 460, alignItems: 'center' },
});
