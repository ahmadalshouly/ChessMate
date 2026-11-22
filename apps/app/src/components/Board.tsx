import { ALL_SQUARES, FILES, Game, type Color, type Piece, type PieceSet, type Square } from '@chessmate/core';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, Easing, Image, PanResponder, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/ui/primitives';

import { useBoardAppearance } from '@/features/account/boardThemes';
import { pieceImage } from '@/features/board/pieceSets';
import { useBoardSound } from '@/features/board/useBoardSound';
import { BoardArrows, type Arrow } from '@/components/BoardArrows';
import { PLACE_ORIGIN, placeAt } from '@/components/boardLayout';
import { haptic } from '@/lib/haptics';
import { useT } from '@/i18n';
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
  /** Play move sounds when the position changes by one move. Default: on, except thumbnails (hideCoordinates) and boards under 160px. */
  sound?: boolean;
  checkSquare?: Square | null;
  /** Squares to tint as under threat (feedback mode only). */
  threatened?: Square[];
  /** Queued premove, tinted until it plays or is cancelled. */
  premove?: { from: string; to: string } | null;
  /** Several queued premoves (web), all tinted. */
  premoves?: { from: string; to: string }[] | null;
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
  /** A pawn is promoting: show the piece choice over the board until one is picked or it is cancelled. */
  promotion?: PromotionChoice | null;
  /**
   * Right-click drawing on the web: drag with the right button for an arrow,
   * right-click a square to circle it, left-click to clear. On by default for
   * boards you play on (with onSquarePress). Shift draws red, Alt blue.
   */
  drawable?: boolean;
  /** Arrows drawn by the screen (engine lines), under the player's own drawings. */
  arrows?: Arrow[];
  /** Secret Queen: squares to badge with a small crown (your secret pawn; both at the end). */
  crowned?: Square[];
  /** Secret Queen: pawns that can be picked as the secret queen, ringed in gold. */
  pickable?: Square[];
}

/**
 * True while the right mouse button is down on a board (web). The drag
 * gesture ignores that press so a right-button drag draws an arrow instead of
 * moving the piece. One flag is enough: there is only one mouse.
 */
const rightButton = { down: false };

/** Colours for drawn shapes: plain, Shift, Alt. Translucent so pieces stay readable. */
const DRAW_COLORS = { plain: 'rgba(38, 158, 92, 0.82)', shift: 'rgba(214, 64, 52, 0.82)', alt: 'rgba(52, 118, 214, 0.82)' } as const;

interface DrawnShapes {
  fen: string;
  arrows: Arrow[];
  marks: { sq: Square; color: string }[];
}

/**
 * Right-button drawing on the web, kept per position: a new move clears it.
 * Uses DOM mouse events on the board element because React Native has no
 * right-button gesture.
 */
function useDrawnShapes(enabled: boolean, fen: string, cell: number, orientation: Color) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [shapes, setShapes] = useState<DrawnShapes>({ fen, arrows: [], marks: [] });
  const latest = useRef({ cell, orientation, fen });
  latest.current = { cell, orientation, fen };

  useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if (Platform.OS !== 'web' || !enabled || !node?.addEventListener) return;
    let start: Square | null = null;
    const squareOf = (e: MouseEvent) => {
      const r = node.getBoundingClientRect();
      return squareAtPoint(e.clientX - r.left, e.clientY - r.top, latest.current.cell, latest.current.orientation);
    };
    const colorOf = (e: MouseEvent) => (e.shiftKey ? DRAW_COLORS.shift : e.altKey ? DRAW_COLORS.alt : DRAW_COLORS.plain);
    const onDown = (e: MouseEvent) => {
      if (e.button === 2) {
        rightButton.down = true;
        start = squareOf(e);
        return;
      }
      if (e.button === 0) setShapes((s) => (s.arrows.length || s.marks.length ? { fen: latest.current.fen, arrows: [], marks: [] } : s));
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 2) return;
      // Cleared after the gesture handlers have seen this release.
      setTimeout(() => (rightButton.down = false), 0);
      if (!start) return;
      const from = start;
      const to = squareOf(e);
      start = null;
      if (!to) return;
      const color = colorOf(e);
      setShapes((prev) => {
        const s = prev.fen === latest.current.fen ? prev : { fen: latest.current.fen, arrows: [], marks: [] };
        if (from === to) {
          const had = s.marks.find((m) => m.sq === to);
          return { ...s, marks: had ? s.marks.filter((m) => m.sq !== to) : [...s.marks, { sq: to, color }] };
        }
        const had = s.arrows.find((a) => a.from === from && a.to === to);
        return { ...s, arrows: had ? s.arrows.filter((a) => a !== had) : [...s.arrows, { from, to, color }] };
      });
    };
    const onContext = (e: MouseEvent) => e.preventDefault();
    node.addEventListener('mousedown', onDown, true);
    node.addEventListener('mouseup', onUp, true);
    node.addEventListener('contextmenu', onContext);
    return () => {
      node.removeEventListener('mousedown', onDown, true);
      node.removeEventListener('mouseup', onUp, true);
      node.removeEventListener('contextmenu', onContext);
    };
  }, [enabled]);

  const current = shapes.fen === fen ? shapes : null;
  return { ref, arrows: current?.arrows ?? [], marks: current?.marks ?? [] };
}

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface PromotionChoice {
  /** The promotion square. */
  to: Square;
  color: Color;
  onPick: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

/** Order of the choices, starting on the promotion square: the usual picks first. */
const PROMOTION_ORDER: PromotionPiece[] = ['q', 'n', 'r', 'b'];

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

/** How long a piece takes to slide to its new square. */
const SLIDE_MS = 180;
/** More changed squares than this (a new game, a jump through the moves) shows the position straight away. */
const MAX_SLIDE_CHANGES = 6;

interface Slide {
  piece: Piece;
  from: Square;
  to: Square;
  /** What stood on `to` before (a capture), shown until the slide lands. */
  captured: Piece | null;
}

/**
 * The pieces that moved between two positions: each piece that appeared on a
 * square is matched to a vanished piece of the same colour and type (or a pawn
 * of that colour, for a promotion), closest first. Covers normal moves,
 * captures, castling (two slides), en passant and stepping backwards.
 */
function slidesBetween(prev: (Piece | null)[][], next: (Piece | null)[][]): Slide[] {
  const removed: { sq: Square; piece: Piece }[] = [];
  const added: { sq: Square; piece: Piece }[] = [];
  let changes = 0;
  for (const sq of ALL_SQUARES) {
    const a = pieceAt(prev, sq);
    const b = pieceAt(next, sq);
    if (a?.type === b?.type && a?.color === b?.color) continue;
    changes++;
    if (a) removed.push({ sq, piece: a });
    if (b) added.push({ sq, piece: b });
  }
  if (changes === 0 || changes > MAX_SLIDE_CHANGES) return [];
  const dist = (x: Square, y: Square) => Math.abs(x.charCodeAt(0) - y.charCodeAt(0)) + Math.abs(Number(x[1]) - Number(y[1]));
  const slides: Slide[] = [];
  const pool = [...removed];
  for (const a of added) {
    const same = pool.filter((r) => r.piece.color === a.piece.color && r.piece.type === a.piece.type);
    const candidates = same.length ? same : pool.filter((r) => r.piece.color === a.piece.color && (r.piece.type === 'p' || a.piece.type === 'p'));
    if (!candidates.length) continue;
    const from = candidates.reduce((best, r) => (dist(r.sq, a.sq) < dist(best.sq, a.sq) ? r : best));
    pool.splice(pool.indexOf(from), 1);
    const before = pieceAt(prev, a.sq);
    slides.push({ piece: a.piece, from: from.sq, to: a.sq, captured: before && before.color !== a.piece.color ? before : null });
  }
  return slides;
}

/** Top-left of a square's cell for an orientation. */
function cellOrigin(sq: Square, orientation: Color, cell: number) {
  const f = sq.charCodeAt(0) - 97;
  const r = Number(sq[1]);
  return { x: (orientation === 'w' ? f : 7 - f) * cell, y: (orientation === 'w' ? 8 - r : r - 1) * cell };
}

/**
 * Slides pieces to their new squares when the position changes by a move,
 * instead of making them vanish and reappear. A piece just dropped by drag is
 * already where it belongs and is not slid again.
 */
function useSlides(fen: string, position: (Piece | null)[][], orientation: Color, size: number) {
  const [prev, setPrev] = useState({ fen, position, orientation, size });
  const [run, setRun] = useState<{ key: string; slides: Slide[]; progress: Animated.Value } | null>(null);
  // The last drag-and-drop, on the position it was made from.
  const [dropped, setDropped] = useState<{ from: Square; to: Square; fen: string } | null>(null);

  if (prev.fen !== fen || prev.orientation !== orientation || prev.size !== size) {
    // Same board turned or resized: just show it. A new position: work out what moved.
    const moved = prev.fen !== fen && prev.orientation === orientation && prev.size === size;
    setPrev({ fen, position, orientation, size });
    const drop = dropped?.fen === prev.fen ? dropped : null;
    const slides = moved ? slidesBetween(prev.position, position).filter((s) => !(drop && s.from === drop.from && s.to === drop.to)) : [];
    if (dropped) setDropped(null);
    setRun(slides.length ? { key: fen, slides, progress: new Animated.Value(0) } : null);
  }

  useEffect(() => {
    if (!run) return;
    const anim = Animated.timing(run.progress, {
      toValue: 1,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start(({ finished }) => finished && setRun((r) => (r === run ? null : r)));
    return () => anim.stop();
  }, [run]);

  const markDropped = (from: Square, to: Square) => setDropped({ from, to, fen });
  return { run, hidden: new Set(run?.slides.map((sl) => sl.to) ?? []), markDropped };
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
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, PLACE_ORIGIN]}>
      {ORDER[orientation].map((sq, i) => (
        <View key={sq} style={[placeAt((i % 8) * cell, Math.floor(i / 8) * cell, cell + 0.5, cell + 0.5, size), { backgroundColor: squareFill(theme, sq) }]} />
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
  const slide = useSlides(fen, position, orientation, size);
  const { enabled: dragEnabled, state: dragging, offset: dragOffset, ref: dragRef, handlers: dragHandlers } = useDrag({
    ...props,
    position,
    cell,
    onSquarePress,
    onDropped: slide.markDropped,
  });
  const drawn = useDrawnShapes(props.drawable ?? !!onSquarePress, fen, cell, orientation);
  // Move sounds on every board; thumbnails and small previews stay quiet (a grid of live games would clatter).
  useBoardSound(fen, props.sound ?? (!props.hideCoordinates && size >= 160));
  const allArrows = props.arrows ? [...props.arrows, ...drawn.arrows] : drawn.arrows;
  const targetSet = new Set(targets);
  const premoveSquares = new Set<string>();
  for (const pm of [...(premove ? [premove] : []), ...(props.premoves ?? [])]) {
    premoveSquares.add(pm.from);
    premoveSquares.add(pm.to);
  }
  const threatSet = new Set(threatened);

  return (
    // The board never mirrors: files run a to h left to right in every language (see placeAt).
    <View ref={drawn.ref} style={[styles.board, PLACE_ORIGIN, { width: size, height: size, borderRadius: Math.max(4, size * 0.012), direction: 'ltr' }]} accessibilityRole="grid">
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
        if (premoveSquares.has(sq)) overlays.push(PREMOVE_TINT);
        if (selected === sq) overlays.push(colors.selected);
        if (checkSquare === sq) overlays.push(colors.check);
        const coordColor = isLight ? colors.coordOnLight : colors.coordOnDark;
        const coordSize = Math.max(8, cell * 0.17);
        const coordBox = Math.ceil(coordSize * 1.3);
        return (
          <Pressable
            key={sq}
            onPress={() => onSquarePress?.(sq)}
            disabled={!onSquarePress}
            accessibilityLabel={`${sq}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
            style={[placeAt(col * cell, row * cell, cell, cell, size), PLACE_ORIGIN]}>
            {overlays.map((c, k) => (
              <View key={k} style={[StyleSheet.absoluteFill, { backgroundColor: c }]} />
            ))}
            {coordinates && col === 0 && (
              <Text style={[styles.coord, placeAt(cell * 0.02, 0, coordBox, coordBox, cell), { color: coordColor, fontSize: coordSize, lineHeight: coordBox }]}>{rank}</Text>
            )}
            {coordinates && row === 7 && (
              <Text style={[styles.coord, placeAt(cell - coordBox - cell * 0.02, cell - coordBox, coordBox, coordBox, cell), { color: coordColor, fontSize: coordSize, lineHeight: coordBox }]}>
                {FILES[fileIdx]}
              </Text>
            )}
            {piece && !slide.hidden.has(sq) && (
              <View style={dragging?.from === sq ? styles.lifted : undefined}>
                <PieceView piece={piece} cell={cell} set={set} />
              </View>
            )}
            {props.pickable?.includes(sq) && (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pickable, { borderWidth: Math.max(2, cell * 0.06), borderRadius: cell * 0.12 }]} />
            )}
            {props.crowned?.includes(sq) && (
              <View
                pointerEvents="none"
                style={[styles.crown, { width: cell * 0.36, height: cell * 0.36, borderRadius: cell * 0.18, top: cell * 0.03, end: cell * 0.03 }]}>
                <Text style={{ fontSize: cell * 0.24, lineHeight: cell * 0.3, color: '#3a2a00' }}>♛</Text>
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
      {slide.run?.slides.map((sl) => {
        const a = cellOrigin(sl.from, orientation, cell);
        const b = cellOrigin(sl.to, orientation, cell);
        const centre = (v: number) => v + cell / 2 - size / 2;
        const p = slide.run!.progress;
        return (
          <View key={`slide-${slide.run!.key}-${sl.from}-${sl.to}`} pointerEvents="none" style={[StyleSheet.absoluteFill, PLACE_ORIGIN]}>
            {sl.captured && (
              <Animated.View style={[placeAt(b.x, b.y, cell, cell, size), { opacity: p.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }) }]}>
                <PieceView piece={sl.captured} cell={cell} set={set} />
              </Animated.View>
            )}
            <Animated.View
              style={[
                styles.floating,
                {
                  width: cell,
                  height: cell,
                  transform: [
                    { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [centre(a.x), centre(b.x)] }) },
                    { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [centre(a.y), centre(b.y)] }) },
                  ],
                },
              ]}>
              <PieceView piece={sl.piece} cell={cell} set={set} />
            </Animated.View>
          </View>
        );
      })}
      {dragEnabled && <View ref={dragRef} collapsable={false} style={[StyleSheet.absoluteFill, WEB_NO_GESTURES]} {...dragHandlers} />}
      {dragging?.moved && (
        <Animated.View
          pointerEvents="none"
          // Centred like the squares (see placeAt), then moved by the drag offset.
          style={[styles.floating, { width: cell, height: cell, transform: [{ translateX: (cell - size) / 2 }, { translateY: (cell - size) / 2 }, ...dragOffset.getTranslateTransform(), { scale: 1.12 }] }]}>
          <PieceView piece={dragging.piece} cell={cell} set={set} />
        </Animated.View>
      )}
      {drawn.marks.map((m) => {
        const f = m.sq.charCodeAt(0) - 97;
        const r = Number(m.sq[1]);
        const col = orientation === 'w' ? f : 7 - f;
        const row = orientation === 'w' ? 8 - r : r - 1;
        return (
          <View
            key={`mark-${m.sq}`}
            pointerEvents="none"
            style={[placeAt(col * cell + cell * 0.06, row * cell + cell * 0.06, cell * 0.88, cell * 0.88, size), { borderRadius: cell, borderWidth: Math.max(2, cell * 0.07), borderColor: m.color }]}
          />
        );
      })}
      {allArrows.length > 0 && <BoardArrows arrows={allArrows} size={size} orientation={orientation} />}
      {props.promotion && <PromotionPicker choice={props.promotion} orientation={orientation} size={size} set={set} />}
      {/* Glass edge: a hairline highlight that sits on top of everything. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.edge, { borderColor: colors.frame, borderRadius: Math.max(4, size * 0.012) }]} />
    </View>
  );
});

/**
 * Promotion choice: the board dims and the four pieces stand in a column from
 * the promotion square towards the middle of the board. Tap one to promote;
 * tap anywhere else to take the move back.
 */
function PromotionPicker({ choice, orientation, size, set }: { choice: PromotionChoice; orientation: Color; size: number; set: PieceSet }) {
  const tr = useT();
  const cell = size / 8;
  const fileIdx = choice.to.charCodeAt(0) - 97;
  const rank = Number(choice.to[1]);
  const col = orientation === 'w' ? fileIdx : 7 - fileIdx;
  const row = orientation === 'w' ? 8 - rank : rank - 1;
  const step = row === 0 ? 1 : -1;
  return (
    <View style={[StyleSheet.absoluteFill, PLACE_ORIGIN, { zIndex: 20 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('common.cancel')}
        onPress={choice.onCancel}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 10, 14, 0.55)' }]}
      />
      {PROMOTION_ORDER.map((type, i) => (
        <Pressable
          key={type}
          accessibilityRole="button"
          accessibilityLabel={tr(`chess.piece.${type}`)}
          onPress={() => {
            haptic('pickup');
            choice.onPick(type);
          }}
          style={[placeAt(col * cell, (row + step * i) * cell, cell, cell, size), PLACE_ORIGIN]}>
          {({ pressed }) => (
            <View style={[styles.promoChip, { width: cell * 0.94, height: cell * 0.94, borderRadius: cell * 0.47, opacity: pressed ? 0.75 : 1 }]}>
              <PieceView piece={{ type, color: choice.color }} cell={cell * 0.86} set={set} />
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

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
  /** Told about a drop before onPieceDrop, so the board doesn't slide that piece again. */
  onDropped?: (from: Square, to: Square) => void;
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
          if (rightButton.down || (e.nativeEvent as unknown as { button?: number }).button === 2) {
            press.current = null;
            return;
          }
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
          if (rightButton.down) return;
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
          if (rightButton.down) return;
          if (!cur?.sq) return;
          const { cell, orientation, onSquarePress, onPieceDrop } = latest.current;
          if (cur.moved) {
            const to = squareAtPoint(cur.x + g.dx, cur.y + g.dy, cell, orientation);
            // Dropped back on its square or off the board: keep it selected for a tap move.
            if (to && to !== cur.sq) {
              latest.current.onDropped?.(cur.sq, to);
              onPieceDrop?.(cur.sq, to);
            }
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
  coord: { fontWeight: '700', letterSpacing: 0.2, textAlign: 'center' },
  lifted: { opacity: 0.3 },
  floating: { position: 'absolute', zIndex: 10 },
  pickable: { backgroundColor: 'rgba(240, 196, 64, 0.28)', borderColor: 'rgba(240, 196, 64, 0.95)' },
  crown: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(240, 196, 64, 0.95)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  promoChip: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
