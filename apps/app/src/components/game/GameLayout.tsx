import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, View, type LayoutChangeEvent, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionBar, type GameAction } from './ActionBar';
import { PLAYER_CARD_HEIGHT } from './PlayerCard';

const GAP = 6;
const PAD = 12;
const BAR = 62;
/** Space kept under the board for the move list, banners and panels on phones. */
const DOCK_MIN = 132;
const SIDE = 360;
const WIDE_AT = 860;

export interface GameLayoutProps {
  /** Opponent card, above the board. */
  top: ReactNode;
  /** Your card, under the board. */
  bottom: ReactNode;
  /** The board at the computed size. Overlays (result card) go inside. */
  renderBoard: (size: number) => ReactNode;
  /** Shown under the board: move list, offers, notices. */
  dock: ReactNode;
  /** Chat or options, shown over the dock (never over the board unless the keyboard is up). */
  panel?: ReactNode;
  /** Connection or other notice above everything. */
  notice?: ReactNode;
  actions: GameAction[];
}

/**
 * The game screen: players and board in a fixed position that fills the
 * screen, the dock under it, and the action bar at the bottom. Nothing
 * scrolls the board away; chat and options open over the dock. On wide
 * screens the dock and actions move to a column beside the board.
 */
export function GameLayout({ top, bottom, renderBoard, dock, panel, notice, actions }: GameLayoutProps) {
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

  const wide = !!box && box.w >= WIDE_AT;
  const bottomSpace = Math.max(insets.bottom, 8);
  let size = 0;
  if (box) {
    const h = box.h - noticeH;
    size = wide
      ? Math.min(h - PLAYER_CARD_HEIGHT * 2 - GAP * 2 - PAD * 2, box.w - SIDE - PAD * 3)
      : Math.min(box.w - PAD * 2, h - PLAYER_CARD_HEIGHT * 2 - GAP * 2 - PAD - DOCK_MIN - BAR - GAP * 2 - bottomSpace);
    size = Math.max(200, Math.min(720, Math.floor(size / 8) * 8));
  }

  const board = (
    <View style={{ width: size, alignSelf: 'center' }}>
      {top}
      <View style={{ marginVertical: GAP, width: size, height: size }}>{renderBoard(size)}</View>
      {bottom}
    </View>
  );

  const dockArea = (
    <View style={styles.dock}>
      <View style={StyleSheet.absoluteFill}>{dock}</View>
    </View>
  );

  return (
    <View style={styles.root} onLayout={onLayout}>
      {box && (
        <>
          <View onLayout={(e) => setNoticeH(e.nativeEvent.layout.height)}>{notice}</View>
          {wide ? (
            <View style={[styles.wide, { paddingBottom: bottomSpace }]}>
              {board}
              <View style={[styles.side, { height: size + PLAYER_CARD_HEIGHT * 2 + GAP * 2 }]}>
                <View style={styles.dock}>
                  <View style={StyleSheet.absoluteFill}>{dock}</View>
                  {panel && <View style={StyleSheet.absoluteFill}>{panel}</View>}
                </View>
                <ActionBar actions={actions} />
              </View>
            </View>
          ) : (
            <View style={[styles.narrow, { width: size, paddingBottom: bottomSpace }]}>
              {board}
              {dockArea}
              <ActionBar actions={actions} />
            </View>
          )}
          {!wide && panel && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <View style={{ flex: 1 }} pointerEvents="none" />
              <View style={[styles.panel, { width: size, minHeight: DOCK_MIN + PLAYER_CARD_HEIGHT, height: panelHeight(box.h, noticeH, size, bottomSpace) }]}>
                {panel}
              </View>
              <View style={{ height: keyboard ? GAP : BAR + GAP + bottomSpace }} pointerEvents="none" />
            </KeyboardAvoidingView>
          )}
        </>
      )}
    </View>
  );
}

/** Height of the dock on phones: from under your card to the action bar. */
function panelHeight(h: number, noticeH: number, size: number, bottomSpace: number) {
  const used = noticeH + PAD + PLAYER_CARD_HEIGHT * 2 + GAP * 2 + size + GAP + BAR + GAP + bottomSpace;
  return Math.max(DOCK_MIN, h - used);
}

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  const subs = useRef<{ remove(): void }[]>([]);
  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    subs.current = [Keyboard.addListener(show, () => setVisible(true)), Keyboard.addListener(hide, () => setVisible(false))];
    return () => subs.current.forEach((s) => s.remove());
  }, []);
  return visible;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  narrow: { flex: 1, alignSelf: 'center', paddingTop: PAD, gap: GAP },
  wide: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: PAD * 2, padding: PAD },
  side: { width: SIDE, gap: GAP * 2 },
  dock: { flex: 1, minHeight: 0, marginTop: GAP },
  panel: { alignSelf: 'center' },
});
