import { ALL_SQUARES, FILES, Game, type Color, type Piece, type PieceSet, type Square } from '@chessmate/core';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, Image, PanResponder, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/ui/primitives';

import { useBoardAppearance } from '@/features/account/boardThemes';
import { pieceImage } from '@/features/board/pieceSets';
import { haptic } from '@/lib/haptics';
import { useBoardTheme, type BoardTheme } from '@/ui';

const PREMOVE_TINT = 'rgba(64, 104, 168, 0.42)';

export interface BoardProps {
  /** Position to display. Boards are driven by immutable FEN strings. */
  fen: string;
  orientation: Color;
  size: number;
  selected?: Square | null;
  targets?: Square[];
  lastMove?: { from: Square; to: Square } | null;
  checkSquare?: Square | null;
  /** Squares to tint as under threat (feedback mode only). */
  threatened?: Square[];
  /** Queued premove, tinted until it plays or is cancelled. */
  premove?: { from: string; to: string } | null;
  onSquarePress?: (square: Square) => void;
  /** Whether the piece on a square can be picked up and dragged. Omit to allow taps only. */
  canDrag?: (square: Square) => boolean;
  /** A dragged piece was released on another square. */
  onPieceDrop?: (from: Square, to: Square) => void;
  /** Right-click on the web: cancel the selection or queued premove. */
  onCancel?: () => void;
  /** Override the user's board theme (previews). Defaults to the theme chosen in settings. */
  theme?: BoardTheme;
  /** Override the user's piece set (previews). Defaults to the set chosen in settings. */
  pieces?: PieceSet;
  /** Hide coordinates regardless of settings (thumbnails). */
  hideCoordinates?: boolean;
}

/** How far a press can wander (px) and still count as a tap. */
const DRAG_SLOP = 6;

/** Board square under a point in board coordinates, or null when off the board. */
function squareAtPoint(x: number, y: number, cell: number, orientation: Color): Square | null {
  const col = Math.floor(x / cell);
  const row = Math.floor(y / cell);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const file = orientation === 'w' ? col : 7 - col;
  const rank = orientation === 'w' ? 8 - row : row + 1;
  return `${FILES[file]}${rank}` as Square;
}

function pieceAt(position: (Piece | null)[][], sq: Square): Piece | null {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]);
  return position[8 - rank]?.[file] ?? null;
}

/** Square order for an orientation, top-left first. */
const ORDER: Record<Color, Square[]> = {
  w: [...ALL_SQUARES].sort((a, b) => Number(b[1]) - Number(a[1]) || a.charCodeAt(0) - b.charCodeAt(0)),
  b: [...ALL_SQUARES].sort((a, b) => Number(a[1]) - Number(b[1]) || b.charCodeAt(0) - a.charCodeAt(0)),
};

/** Shifts a #RRGGBB colour lighter (amount > 0) or darker (amount < 0). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.min(255, Math.max(0, amount > 0 ? v + (255 - v) * amount : v * (1 + amount))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Stable per-square tone so "natural" boards look like stone or wood rather than flat fills. */
function squareFill(theme: BoardTheme, sq: Square): string {
  const isLight = ((sq.charCodeAt(0) - 97 + Number(sq[1])) & 1) === 0;
  const base = isLight ? theme.light : theme.dark;
  if (theme.finish !== 'natural' || !base.startsWith('#')) return base;
  const h = Math.imul(sq.charCodeAt(0) * 31 + Number(sq[1]) * 131, 2654435761) >>> 0;
  return shade(base, ((h % 1000) / 1000 - 0.5) * 0.09);
}

/** The squares and finish only depend on theme and orientation, so they render once per change. */
const Surface = memo(function Surface({ theme, orientation, size }: { theme: BoardTheme; orientation: Color; size: number }) {
  const cell = size / 8;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {ORDER[orientation].map((sq, i) => (
        <View key={sq} style={{ position: 'absolute', left: (i % 8) * cell, top: Math.floor(i / 8) * cell, width: cell + 0.5, height: cell + 0.5, backgroundColor: squareFill(theme, sq) }} />
      ))}
      {theme.finish !== 'flat' && (
        <LinearGradient
          pointerEvents="none"
          colors={theme.finish === 'glass' ? ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.04)', 'rgba(0,0,0,0.10)'] : ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.08)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
});

export const Board = memo(function Board(props: BoardProps) {
  const { fen, orientation, size, selected, targets = [], lastMove, checkSquare, threatened = [], premove, onSquarePress } = props;
  const { boardTheme } = useBoardTheme();
  const colors = props.theme ?? boardTheme;
  const position = useMemo(() => new Game(fen).raw.board() as (Piece | null)[][], [fen]);
  const cell = size / 8;
  // Piece set, coordinates, legal-move dots and last-move highlight follow the user's board settings.
  const look = useBoardAppearance();
  const set = props.pieces ?? look.pieces;
  // Thumbnails are too small for readable coordinates.
  const coordinates = look.coordinates && !props.hideCoordinates && cell >= 24;
  const { enabled: dragEnabled, state: dragging, offset: dragOffset, ref: dragRef, handlers: dragHandlers } = useDrag({ ...props, position, cell, onSquarePress });
  const targetSet = new Set(targets);
  const threatSet = new Set(threatened);

  return (
    // The board never mirrors: files run a to h left to right in every language.
    <View style={[styles.board, { width: size, height: size, borderRadius: Math.max(4, size * 0.012), direction: 'ltr' }]} accessibilityRole="grid">
      <Surface theme={colors} orientation={orientation} size={size} />
      {ORDER[orientation].map((sq, i) => {
        const fileIdx = sq.charCodeAt(0) - 97;
        const rank = Number(sq[1]);
        const isLight = (fileIdx + rank) % 2 === 0;
        const piece = pieceAt(position, sq);
        const row = Math.floor(i / 8);
        const col = i % 8;
        const overlays: string[] = [];
        if (look.highlightLastMove && lastMove && (lastMove.from === sq || lastMove.to === sq)) overlays.push(colors.lastMove);
        if (threatSet.has(sq)) overlays.push(colors.threat);
        if (premove && (premove.from === sq || premove.to === sq)) overlays.push(PREMOVE_TINT);
        if (selected === sq) overlays.push(colors.selected);
        if (checkSquare === sq) overlays.push(colors.check);
        const coordColor = isLight ? colors.coordOnLight : colors.coordOnDark;
        return (
          <Pressable
            key={sq}
            onPress={() => onSquarePress?.(sq)}
            disabled={!onSquarePress}
            accessibilityLabel={`${sq}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
            style={{ position: 'absolute', left: col * cell, top: row * cell, width: cell, height: cell }}>
            {overlays.map((c, k) => (
              <View key={k} style={[StyleSheet.absoluteFill, { backgroundColor: c }]} />
            ))}
            {coordinates && col === 0 && <Text style={[styles.coord, { color: coordColor, top: cell * 0.03, left: cell * 0.06, fontSize: Math.max(8, cell * 0.17) }]}>{rank}</Text>}
            {coordinates && row === 7 && (
              <Text style={[styles.coord, { color: coordColor, bottom: cell * 0.02, right: cell * 0.06, fontSize: Math.max(8, cell * 0.17) }]}>{FILES[fileIdx]}</Text>
            )}
            {piece && (
              <View style={dragging?.from === sq ? styles.lifted : undefined}>
                <PieceView piece={piece} cell={cell} set={set} />
              </View>
            )}
            {dragging?.over === sq && dragging.over !== dragging.from && (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: Math.max(2, cell * 0.06), borderColor: colors.hint }]} />
            )}
            {look.showLegalMoves && targetSet.has(sq) && (
              <View
                pointerEvents="none"
                style={
                  piece
                    ? [StyleSheet.absoluteFill, { borderWidth: cell * 0.075, borderColor: colors.hint, borderRadius: cell / 2 }]
                    : { position: 'absolute', left: cell * 0.36, top: cell * 0.36, width: cell * 0.28, height: cell * 0.28, borderRadius: cell, backgroundColor: colors.hint }
                }
              />
            )}
          </Pressable>
        );
      })}
      {dragEnabled && <View ref={dragRef} collapsable={false} style={[StyleSheet.absoluteFill, WEB_NO_GESTURES]} {...dragHandlers} />}
      {dragging?.moved && (
        <Animated.View pointerEvents="none" style={[styles.floating, { width: cell, height: cell, transform: [...dragOffset.getTranslateTransform(), { scale: 1.12 }] }]}>
          <PieceView piece={dragging.piece} cell={cell} set={set} />
        </Animated.View>
      )}
      {/* Glass edge: a hairline highlight that sits on top of everything. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.edge, { borderColor: colors.frame, borderRadius: Math.max(4, size * 0.012) }]} />
    </View>
  );
});

function PieceView({ piece, cell, set }: { piece: Piece; cell: number; set: PieceSet }) {
  return <Image source={pieceImage(set, piece.color, piece.type)} style={{ width: cell, height: cell }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

// On the web, stop the page scrolling or selecting text while a piece is dragged.
const WEB_NO_GESTURES = (Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none', cursor: 'pointer' } : {}) as ViewStyle;

interface DragState {
  from: Square;
  piece: Piece;
  over: Square | null;
  /** True once the pointer moved past the tap slop and the piece follows it. */
  moved: boolean;
}

/**
 * Drag-and-drop on top of tap-to-move. One transparent layer over the board
 * owns the gesture, so coordinates are always board-relative. A short press is
 * passed on as a tap; a press that moves drags the piece. Pressing a movable
 * piece selects it straight away so its legal moves show while dragging.
 */
function useDrag(p: {
  orientation: Color;
  selected?: Square | null;
  position: (Piece | null)[][];
  cell: number;
  onSquarePress?: (square: Square) => void;
  canDrag?: (square: Square) => boolean;
  onPieceDrop?: (from: Square, to: Square) => void;
  onCancel?: () => void;
}) {
  const [state, setState] = useState<DragState | null>(null);
  const [offset] = useState(() => new Animated.ValueXY());
  const ref = useRef<ComponentRef<typeof View>>(null);
  // The responder is created once; it reads the latest props through this ref.
  const latest = useRef(p);
  latest.current = p;
  const press = useRef<{ sq: Square | null; x: number; y: number; draggable: boolean; selectedOnDown: boolean; moved: boolean }>(null);
  const enabled = !!p.onSquarePress;

  const handlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Scrolling still works when the press starts on a square without a movable piece.
        onShouldBlockNativeResponder: () => !!press.current?.draggable,
        onPanResponderTerminationRequest: () => !press.current?.moved,
        onPanResponderGrant: (e) => {
          const { cell, orientation, canDrag, selected, onSquarePress, position } = latest.current;
          const x = e.nativeEvent.locationX;
          const y = e.nativeEvent.locationY;
          const sq = squareAtPoint(x, y, cell, orientation);
          const piece = sq ? pieceAt(position, sq) : null;
          const draggable = !!(sq && piece && canDrag?.(sq));
          press.current = { sq, x, y, draggable, selectedOnDown: false, moved: false };
          if (draggable && sq && piece) {
            if (selected !== sq) {
              onSquarePress?.(sq);
              press.current.selectedOnDown = true;
            }
            setState({ from: sq, piece, over: sq, moved: false });
          }
        },
        onPanResponderMove: (_e, g) => {
          const cur = press.current;
          if (!cur?.draggable || !cur.sq) return;
          if (!cur.moved && Math.hypot(g.dx, g.dy) < DRAG_SLOP) return;
          const { cell, orientation } = latest.current;
          const x = cur.x + g.dx;
          const y = cur.y + g.dy;
          offset.setValue({ x: x - cell / 2, y: y - cell / 2 });
          const over = squareAtPoint(x, y, cell, orientation);
          if (!cur.moved) {
            cur.moved = true;
            haptic('pickup');
          }
          setState((s) => (s && (s.over !== over || !s.moved) ? { ...s, over, moved: true } : s));
        },
        onPanResponderRelease: (_e, g) => {
          const cur = press.current;
          press.current = null;
          setState(null);
          if (!cur?.sq) return;
          const { cell, orientation, onSquarePress, onPieceDrop } = latest.current;
          if (cur.moved) {
            const to = squareAtPoint(cur.x + g.dx, cur.y + g.dy, cell, orientation);
            // Dropped back on its square or off the board: keep it selected for a tap move.
            if (to && to !== cur.sq) onPieceDrop?.(cur.sq, to);
            return;
          }
          // A tap. Movable pieces were already selected on press; tapping the selected one again clears it.
          if (!cur.selectedOnDown) onSquarePress?.(cur.sq);
        },
        onPanResponderTerminate: () => {
          press.current = null;
          setState(null);
        },
      }).panHandlers,
    [offset],
  );

  // Right-click cancels a premove or selection, like most chess sites.
  useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if (Platform.OS !== 'web' || !enabled || !node?.addEventListener) return;
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      press.current = null;
      setState(null);
      latest.current.onCancel?.();
    };
    node.addEventListener('contextmenu', onContext);
    return () => node.removeEventListener('contextmenu', onContext);
  }, [enabled]);

  return { enabled, state, offset, ref, handlers };
}

const styles = StyleSheet.create({
  board: { overflow: 'hidden' },
  edge: { borderWidth: StyleSheet.hairlineWidth * 2 },
  coord: { position: 'absolute', fontWeight: '700', letterSpacing: 0.2 },
  lifted: { opacity: 0.3 },
  floating: { position: 'absolute', left: 0, top: 0, zIndex: 10 },
});
