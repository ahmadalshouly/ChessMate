import {
  CASTLING_RIGHTS,
  FILES,
  Game,
  castlingAllowed,
  emptySetup,
  fenPlayable,
  movePiece,
  parseSetupFen,
  putPiece,
  setupFen,
  setupProblem,
  startingSetup,
  type CastlingRight,
  type Color,
  type PieceType,
  type Setup,
  type Square,
} from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { BackHandler, Image, Platform, Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { GestureDetector, MouseButton, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Board } from '@/components/Board';
import { useSidebarFrame } from '@/components/shell/SidebarFrame';
import { GameIcon, type GameIconName } from '@/components/game/ActionBar';
import { Card } from '@/components/ui';
import { useBoardAppearance } from '@/features/account/boardThemes';
import { pieceImage } from '@/features/board/pieceSets';
import { useT } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { copyText, pasteText } from '@/lib/share';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { useFillHeight, useWideBoard } from '@/lib/useWideBoard';
import { Button, Tabs, Text, fonts, useAppTheme, useToast } from '@/ui';
import { KeyboardScrollView } from '@/ui/components/Keyboard';
import { TextInput } from '@/ui/primitives';

/** What a tap on the board does: move pieces, remove them, or place one (`wq` is a white queen). */
type Tool = 'move' | 'erase' | `${Color}${PieceType}`;

const PALETTE: PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];
/** Palette rows are this tall, as a share of a board square. */
const ROW = 0.8;
const GAP = 6;

/**
 * Board editor for the analysis board: set up any position by hand, or paste a
 * FEN, then analyse it. Pick a piece from the rows above and below the board
 * and tap squares to place it (tap the same piece again to take it off), or
 * drag it from the row onto a square; drag pieces to move them, or off the
 * board to remove them. Nothing limits what goes where: all 64 squares can be
 * filled. The panel says when the engine can't look at the result (no king,
 * more than 32 pieces, ...); Analyse still opens it, with the engine off.
 */
export function PositionEditor({
  fen,
  orientation: initialOrientation,
  onAnalyse,
  onCancel,
}: {
  /** Position to start from: the one on the analysis board, or a pasted FEN. */
  fen: string;
  orientation: Color;
  onAnalyse: (fen: string, orientation: Color) => void;
  onCancel: () => void;
}) {
  const tr = useT();
  const toast = useToast();
  const c = useAppTheme().colors;
  const { pieces: set } = useBoardAppearance();
  const [setup, setSetup] = useState<Setup>(() => parseSetupFen(fen) ?? startingSetup());
  const [orientation, setOrientation] = useState<Color>(initialOrientation);
  const [tool, setTool] = useState<Tool>('move');
  const [selected, setSelected] = useState<Square | null>(null);
  // What the player is typing in the FEN box; null shows the position's own FEN.
  const [draft, setDraft] = useState<string | null>(null);

  const current = setupFen(setup);
  const problem = setupProblem(setup);
  const allowed = castlingAllowed(setup.board);
  const draftBad = draft !== null && draft.trim() !== '' && !parseSetupFen(draft);

  // Same layout as the analysis board. The palette rows take the room of the move buttons.
  const { height: winH } = useWindowDimensions();
  const framed = useSidebarFrame();
  const {
    wide,
    size: wideSpace,
    panel: panelWidth,
  } = useWideBoard({
    panel: 404,
    reserve: framed ? 104 : 92,
    sidebar: framed,
    gutter: 12,
  });
  const boardSpace = wide ? wideSpace : Math.min(wideSpace, winH * 0.56);
  // Wide: board and both rows fill the height. Phones: the rows take the room of the move buttons.
  const cell = Math.max(25, Math.floor(wide ? (boardSpace - 2 * GAP) / (8 + 2 * ROW) : Math.min(boardSpace / 8, (boardSpace + 52) / (8 + 2 * ROW))));
  const size = cell * 8;
  const [fillH, onFill] = useFillHeight();

  // Dragging a piece from a palette row onto the board. The piece follows the finger on the UI
  // thread, drawn over the editor; where it lands is worked out from the board's place on screen.
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const boardRef = useRef<ComponentRef<typeof View>>(null);
  const [held, setHeld] = useState<Tool | null>(null);
  const drag = {
    x: useSharedValue(0),
    y: useSharedValue(0),
    rootX: useSharedValue(0),
    rootY: useSharedValue(0),
    on: useSharedValue(0),
  };
  const { rootX, rootY, on: dragOn } = drag;
  const startDrag = (code: Tool) => {
    setTool(code);
    setSelected(null);
    setHeld(code);
    haptic('pickup');
    rootRef.current?.measureInWindow((x, y) => {
      rootX.set(x);
      rootY.set(y);
      dragOn.set(1);
    });
  };
  const endDrag = (code: Tool, ax: number, ay: number, dropped: boolean) => {
    dragOn.set(0);
    setHeld(null);
    if (!dropped) return;
    boardRef.current?.measureInWindow((bx, by, w, h) => {
      const col = Math.floor(((ax - bx) / w) * 8);
      const row = Math.floor(((ay - by) / h) * 8);
      if (col < 0 || col > 7 || row < 0 || row > 7) return;
      const sq = (orientation === 'w' ? `${FILES[col]}${8 - row}` : `${FILES[7 - col]}${row + 1}`) as Square;
      setSetup((s) =>
        putPiece(s, sq, {
          color: code[0] as Color,
          type: code[1] as PieceType,
        }),
      );
      setDraft(null);
      haptic('move');
    });
  };

  // Android's back button leaves the editor, not the analysis board.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [onCancel]);

  const update = (next: Setup) => {
    setSetup(next);
    setDraft(null);
  };

  const onSquare = (sq: Square) => {
    const here = setup.board[sq];
    if (tool === 'move') {
      if (selected) {
        if (selected !== sq) update(movePiece(setup, selected, sq));
        setSelected(null);
      } else if (here) setSelected(sq);
      return;
    }
    setSelected(null);
    if (tool === 'erase') {
      if (here) update(putPiece(setup, sq, null));
      return;
    }
    const piece = { color: tool[0] as Color, type: tool[1] as PieceType };
    // Tapping the same piece again takes it off, so a mis-tap is one more tap to undo.
    update(putPiece(setup, sq, here?.color === piece.color && here.type === piece.type ? null : piece));
    haptic('pickup');
  };

  const pickTool = (next: Tool) => {
    setTool(next);
    setSelected(null);
  };

  const onFenText = (text: string) => {
    setDraft(text);
    const s = parseSetupFen(text);
    if (s) {
      setSetup(s);
      setSelected(null);
    }
  };

  const paste = async () => {
    const text = (await pasteText())?.trim();
    if (!text)
      return toast.show({
        title: tr('analysis.setup.pasteFailed'),
        tone: 'warning',
      });
    const s = parseSetupFen(text.split('\n')[0]!);
    if (s) {
      update(s);
      setSelected(null);
    } else setDraft(text);
  };

  const copy = async () => {
    const ok = await copyText(current);
    toast.show({
      title: tr(ok ? 'analysis.setup.copied' : 'analysis.setup.copyFailed'),
      tone: ok ? 'success' : 'warning',
      duration: 2000,
    });
  };

  const toggleCastling = (right: CastlingRight) =>
    update({
      ...setup,
      castling: { ...setup.castling, [right]: !setup.castling[right] },
    });

  const pieceLabel = (color: Color, type: PieceType) => tr(color === 'w' ? 'analysis.setup.whitePiece' : 'analysis.setup.blackPiece', { piece: tr(`chess.piece.${type}`) });

  const paletteRow = (color: Color, extra: { tool: Tool; icon: GameIconName; label: string }) => (
    <View style={[styles.palette, { width: size, height: Math.round(cell * ROW), direction: 'ltr' }]}>
      {PALETTE.map((type) => {
        const key: Tool = `${color}${type}`;
        return (
          <PaletteSlot
            key={key}
            active={tool === key}
            label={pieceLabel(color, type)}
            onPress={() => pickTool(key)}
            cell={cell}
            drag={{ code: key, ui: drag, start: startDrag, end: endDrag }}>
            <Image source={pieceImage(set, color, type)} style={{ width: cell * ROW * 0.92, height: cell * ROW * 0.92 }} resizeMode="contain" />
          </PaletteSlot>
        );
      })}
      <PaletteSlot active={tool === extra.tool} label={extra.label} onPress={() => pickTool(extra.tool)} cell={cell}>
        <GameIcon name={extra.icon} size={Math.round(cell * 0.42)} color={tool === extra.tool ? c.text : c.muted} />
      </PaletteSlot>
    </View>
  );
  const top: Color = orientation === 'w' ? 'b' : 'w';

  const boardArea = (
    <View style={{ width: size, gap: GAP }}>
      {paletteRow(top, {
        tool: 'move',
        icon: 'hand-back-right-outline',
        label: tr('analysis.setup.move'),
      })}
      <View ref={boardRef} collapsable={false}>
        <Board
          fen={current}
          orientation={orientation}
          size={size}
          selected={selected}
          checkSquare={problem ? null : checkSquareOf(current)}
          onSquarePress={onSquare}
          canDrag={() => true}
          onPieceDrop={(from, to) => {
            update(movePiece(setup, from, to));
            setSelected(null);
          }}
          onPieceRemove={(from) => {
            update(putPiece(setup, from, null));
            setSelected(null);
          }}
          onCancel={() => setSelected(null)}
          dragSelects={false}
          drawable={false}
          sound={false}
        />
      </View>
      {paletteRow(top === 'w' ? 'b' : 'w', {
        tool: 'erase',
        icon: 'eraser',
        label: tr('analysis.setup.erase'),
      })}
    </View>
  );

  const castlingRow = (color: Color, label: string) => (
    <View style={styles.row}>
      <Text variant="label" style={styles.castlingSide}>
        {label}
      </Text>
      {CASTLING_RIGHTS.filter((r) => (color === 'w' ? r === r.toUpperCase() : r === r.toLowerCase())).map((r) => (
        <Chip
          key={r}
          on={setup.castling[r] && allowed[r]}
          disabled={!allowed[r]}
          label={r.toLowerCase() === 'k' ? 'O-O' : 'O-O-O'}
          a11y={`${label} ${r.toLowerCase() === 'k' ? 'O-O' : 'O-O-O'}`}
          onPress={() => toggleCastling(r)}
        />
      ))}
    </View>
  );

  return (
    <View ref={rootRef} collapsable={false} style={[styles.layout, wide && styles.layoutWide]} onLayout={onFill}>
      <View style={[styles.fixed, wide && { paddingTop: 16 }]}>{boardArea}</View>
      {/* Wide: a column the height of the window that the panel scrolls in. */}
      <View style={wide ? [styles.sideColumn, { width: panelWidth, height: fillH }] : styles.panel}>
        <KeyboardScrollView style={styles.panel} contentContainerStyle={[styles.panelContent, { width: wide ? panelWidth - 4 : size }, !wide && { alignSelf: 'center' }]}>
          <Card>
            <Text variant="caption" tone="muted">
              {tr('analysis.setup.hint')}
            </Text>
            <View style={styles.status}>
              <Ionicons name={problem ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={18} color={problem ? c.warning : c.success} />
              <Text variant="label" tone={problem ? 'warning' : 'success'} style={{ flex: 1 }} accessibilityLiveRegion="polite">
                {problem ? `${tr(`analysis.setup.problem.${problem}`)} ${tr('analysis.setup.boardOnly')}` : tr('analysis.setup.ready')}
              </Text>
            </View>
            <View style={styles.row}>
              <Button title={tr('analysis.setup.analyse')} onPress={() => onAnalyse(fenPlayable(current) ? new Game(current).fen : current, orientation)} style={{ flex: 1 }} />
              <Button title={tr('common.cancel')} variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
            </View>
            <Button
              variant="secondary"
              title={tr('analysis.playComputer')}
              leftIcon={<Ionicons name="hardware-chip-outline" size={16} color={c.text} />}
              disabled={!!problem || !!new Game(current).boardOutcome()}
              onPress={() =>
                router.push({
                  pathname: '/play/computer',
                  params: { fen: new Game(current).fen },
                })
              }
            />
          </Card>

          <Card>
            <Text variant="label" tone="muted">
              {tr('analysis.setup.toMove')}
            </Text>
            <Tabs
              items={[
                { key: 'w', label: tr('analysis.setup.whiteToMove') },
                { key: 'b', label: tr('analysis.setup.blackToMove') },
              ]}
              value={setup.turn}
              onChange={(turn) => update({ ...setup, turn })}
            />
            <Text variant="label" tone="muted" style={{ marginTop: 6 }}>
              {tr('analysis.setup.castling')}
            </Text>
            {castlingRow('w', tr('analysis.setup.white'))}
            {castlingRow('b', tr('analysis.setup.black'))}
            <Text variant="caption" tone="tertiary">
              {tr('analysis.setup.castlingHint')}
            </Text>
          </Card>

          <Card>
            <View style={styles.row}>
              <Button
                size="sm"
                variant="secondary"
                title={tr('analysis.setup.start')}
                leftIcon={<Ionicons name="refresh-outline" size={15} color={c.text} />}
                onPress={() => update(startingSetup())}
              />
              <Button
                size="sm"
                variant="secondary"
                title={tr('analysis.setup.clearBoard')}
                leftIcon={<Ionicons name="trash-outline" size={15} color={c.text} />}
                onPress={() => update(emptySetup(setup.turn))}
              />
              <Button
                size="sm"
                variant="secondary"
                title={tr('analysis.setup.flip')}
                leftIcon={<Ionicons name="swap-vertical" size={15} color={c.text} />}
                onPress={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
              />
            </View>
          </Card>

          <Card>
            <Text variant="label" tone="muted">
              {tr('analysis.setup.fen')}
            </Text>
            <TextInput
              value={draft ?? current}
              onChangeText={onFenText}
              onBlur={() => setDraft(null)}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              accessibilityLabel={tr('analysis.setup.fen')}
              style={[
                styles.fen,
                {
                  color: c.text,
                  borderColor: draftBad ? c.warning : c.border,
                  backgroundColor: c.surfaceSunken,
                },
              ]}
            />
            {draftBad && (
              <Text variant="caption" tone="warning">
                {tr('analysis.setup.fenInvalid')}
              </Text>
            )}
            <View style={styles.row}>
              <Button size="sm" variant="secondary" title={tr('analysis.setup.copy')} leftIcon={<Ionicons name="copy-outline" size={15} color={c.text} />} onPress={copy} />
              <Button size="sm" variant="secondary" title={tr('analysis.setup.paste')} leftIcon={<Ionicons name="clipboard-outline" size={15} color={c.text} />} onPress={paste} />
            </View>
          </Card>
        </KeyboardScrollView>
      </View>
      {held && held !== 'move' && held !== 'erase' && <HeldPiece ui={drag} cell={cell} source={pieceImage(set, held[0] as Color, held[1])} />}
    </View>
  );
}

interface DragUI {
  x: SharedValue<number>;
  y: SharedValue<number>;
  rootX: SharedValue<number>;
  rootY: SharedValue<number>;
  on: SharedValue<number>;
}

/** The piece being dragged from a palette row, under the finger (positions are window coordinates). */
function HeldPiece({ ui, cell, source }: { ui: DragUI; cell: number; source: ReturnType<typeof pieceImage> }) {
  const follow = useAnimatedStyle(() => ({
    opacity: ui.on.get(),
    transform: [{ translateX: ui.x.get() - ui.rootX.get() - cell / 2 }, { translateY: ui.y.get() - ui.rootY.get() - cell / 2 }, { scale: 1.12 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.held, { width: cell, height: cell }, follow]}>
      <Image source={source} style={{ width: cell, height: cell }} resizeMode="contain" />
    </Animated.View>
  );
}

// On the web, stop the page scrolling or selecting text while a piece is dragged out of a row.
const WEB_NO_GESTURES = (Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none' } : {}) as ViewStyle;

function PaletteSlot({
  active,
  label,
  onPress,
  cell,
  drag,
  children,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  cell: number;
  /** A piece slot: dragging from it places that piece where it is dropped. */
  drag?: {
    code: Tool;
    ui: DragUI;
    start: (code: Tool) => void;
    end: (code: Tool, x: number, y: number, dropped: boolean) => void;
  };
  children: ReactNode;
}) {
  const c = useAppTheme().colors;
  const { code, ui, start, end } = drag ?? {};
  const pan = usePanGesture(
    useMemo(
      () => ({
        enabled: !!code,
        minDistance: 6,
        mouseButton: MouseButton.LEFT,
        shouldCancelWhenOutside: false,
        maxPointers: 1,
        onActivate: (e: { absoluteX: number; absoluteY: number }) => {
          'worklet';
          if (!ui || !start || !code) return;
          ui.x.set(e.absoluteX);
          ui.y.set(e.absoluteY);
          scheduleOnRN(start, code);
        },
        onUpdate: (e: { absoluteX: number; absoluteY: number }) => {
          'worklet';
          if (!ui) return;
          ui.x.set(e.absoluteX);
          ui.y.set(e.absoluteY);
        },
        onDeactivate: (e: { canceled: boolean }) => {
          'worklet';
          if (!ui || !end || !code) return;
          scheduleOnRN(end, code, ui.x.get(), ui.y.get(), !e.canceled);
        },
      }),
      [code, ui, start, end],
    ),
  );
  const slot = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.slot,
        {
          borderRadius: Math.round(cell * 0.22),
          borderColor: active ? c.accent : 'transparent',
        },
        active ? { backgroundColor: c.surfaceStrong } : pressed && { backgroundColor: c.surfacePressed },
      ]}>
      {children}
    </Pressable>
  );
  if (!code) return slot;
  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={[styles.slotWrap, WEB_NO_GESTURES]}>
        {slot}
      </View>
    </GestureDetector>
  );
}

function Chip({ on, disabled, label, a11y, onPress }: { on: boolean; disabled: boolean; label: string; a11y: string; onPress: () => void }) {
  const c = useAppTheme().colors;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={a11y}
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: on ? c.accent : c.border,
          backgroundColor: on ? c.accent : pressed ? c.surfacePressed : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
      ]}>
      <Ionicons name={on ? 'checkmark' : 'close'} size={14} color={on ? c.onAccent : c.muted} />
      <Text variant="label" color={on ? c.onAccent : c.text} style={{ fontFamily: fonts.monoMedium }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, minHeight: 0 },
  layoutWide: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 16,
  },
  fixed: {
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingTop: 12,
    paddingBottom: 8,
  },
  panel: { flex: 1, flexGrow: 1, minHeight: 0 },
  sideColumn: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
    minHeight: 0,
  },
  panelContent: {
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 2,
    paddingBottom: 32,
  },
  palette: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  slotWrap: { flex: 1, marginHorizontal: 1 },
  held: { position: 'absolute', left: 0, top: 0, zIndex: 20 },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginHorizontal: 1,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  status: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  castlingSide: { minWidth: 64 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  fen: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    textAlignVertical: 'top',
    fontSize: 13,
    fontFamily: fonts.mono,
  },
});
