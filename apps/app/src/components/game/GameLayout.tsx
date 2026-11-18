import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { useAppTheme } from '@/ui';

import { ActionBar, type GameAction } from './ActionBar';
import { PLAYER_CARD_HEIGHT } from './PlayerCard';

const GAP = 6;
const PAD = 8;
const BAR = 62;
export const STRIP_HEIGHT = 38;
/** Popovers (chat, options, confirmations) are never taller than this. */
const POPOVER_MAX = 420;

export interface GameLayoutProps {
  /** Moves in one row, above the players and board. */
  strip: ReactNode;
  /** Opponent card, above the board. */
  top: ReactNode;
  /** Your card, under the board. */
  bottom: ReactNode;
  /** The board at the computed size. Overlays (result card) go inside. */
  renderBoard: (size: number) => ReactNode;
  /** Offers and notices floating over the top of the board. */
  notices?: ReactNode;
  /** What an action button opened: chat, options or a confirmation. Pops up above the bar. */
  popover?: ReactNode;
  onDismissPopover?: () => void;
  /** Connection or other notice above everything. */
  notice?: ReactNode;
  actions: GameAction[];
}

/**
 * The game screen: a row of moves, the players and the board as large as the
 * screen allows, and the action bar. Nothing sits between the board and the
 * bar; whatever a button opens pops up above the bar and closes again, so
 * the board never moves.
 */
export function GameLayout({ strip, top, bottom, renderBoard, notices, popover, onDismissPopover, notice, actions }: GameLayoutProps) {
  const tr = useT();
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState<{ w: number; h: number; windowH: number } | null>(null);
  const [noticeH, setNoticeH] = useState(0);
  const keyboard = useKeyboardVisible();

  // The keyboard (Android resize) shrinks the screen but not the window: keep the board where it is.
  const windowH = useWindowDimensions().height;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBox((b) => (b && b.w === w && b.windowH === windowH && h < b.h ? b : { w, h, windowH }));
  };

  const bottomSpace = Math.max(insets.bottom, 8);
  let size = 0;
  if (box) {
    const h = box.h - noticeH;
    const fit = h - PAD - STRIP_HEIGHT - PLAYER_CARD_HEIGHT * 2 - GAP * 4 - BAR - bottomSpace;
    size = Math.max(200, Math.min(box.w - PAD * 2, fit, 760));
    size = Math.floor(size / 8) * 8;
  }
  const column = Math.max(size, Math.min(box?.w ?? 0, 520) - PAD * 2);

  return (
    <View style={styles.root} onLayout={onLayout}>
      {box && (
        <>
          <View onLayout={(e) => setNoticeH(e.nativeEvent.layout.height)}>{notice}</View>
          <View style={[styles.column, { width: column, paddingBottom: bottomSpace }]}>
            <View style={{ flex: 1 }} />
            <View style={{ height: STRIP_HEIGHT }}>{strip}</View>
            <View style={{ width: size, alignSelf: 'center' }}>
              {top}
              <View style={{ marginVertical: GAP, width: size, height: size }}>
                {renderBoard(size)}
                {notices ? (
                  <View style={styles.notices} pointerEvents="box-none">
                    {notices}
                  </View>
                ) : null}
              </View>
              {bottom}
            </View>
            <View style={{ flex: 1 }} />
            <ActionBar actions={actions} />
          </View>
          {popover ? (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel={tr('game.close')} onPress={onDismissPopover} style={[styles.scrim, { bottom: BAR + GAP + bottomSpace }]} />
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={StyleSheet.absoluteFill} pointerEvents="box-none">
                <View style={{ flex: 1 }} pointerEvents="none" />
                <View style={[styles.popover, { width: column, maxHeight: Math.min(POPOVER_MAX, box.h * 0.7), backgroundColor: t.colors.surfaceSolid }, t.shadows.lg]}>{popover}</View>
                <View style={{ height: keyboard ? GAP : BAR + GAP * 2 + bottomSpace }} pointerEvents="none" />
              </KeyboardAvoidingView>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subs = [Keyboard.addListener(show, () => setVisible(true)), Keyboard.addListener(hide, () => setVisible(false))];
    return () => subs.forEach((s) => s.remove());
  }, []);
  return visible;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  column: { flex: 1, alignSelf: 'center', paddingTop: PAD, gap: GAP },
  notices: { position: 'absolute', top: 8, left: 8, right: 8, gap: 6 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.18)' },
  popover: { alignSelf: 'center', borderRadius: 30, overflow: 'hidden' },
});
