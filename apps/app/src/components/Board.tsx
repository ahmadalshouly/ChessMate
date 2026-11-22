import { ALL_SQUARES, FILES, Game, type Color, type Piece, type PieceSet, type Square } from '@chessmate/core';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { GestureDetector, MouseButton, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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
   * every board except thumbnails (hideCoordinates) and boards under 160px. Shift draws red, Alt blue.
   */
  drawable?: boolean;
  /** Arrows drawn by the screen (engine lines), under the player's own drawings. */
  arrows?: Arrow[];
  /** Secret Queen: squares to badge with a small crown (your secret pawn; both at the end). */
  crowned?: Square[];
  /** Secret Queen: pawns that can be picked as the secret queen, ringed in gold. */
  pickable?: Square[];
}

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
        start = squareOf(e);
        return;
      }
      if (e.button === 0) setShapes((s) => (s.arrows.length || s.marks.length ? { fen: latest.current.fen, arrows: [], marks: [] } : s));
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 2 || !start) return;
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
const SLIDE_MS = 160;
/** How long a dropped piece takes to glide back when the move doesn't happen. */
const SNAP_BACK_MS = 140;
/** More changed squares than this (a new game, a jump through the moves) shows the position straight away. */
const MAX_SLIDE_CHANGES = 6;
const SLIDE_EASING = Easing.out(Easing.cubic);

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
 * already where it belongs and is not slid again. The slide itself runs on the
 * UI thread (see SlidingPiece); React only renders when a slide starts and ends.
 */
function useSlides(fen: string, position: (Piece | null)[][], orientation: Color, size: number) {
  const [prev, setPrev] = useState({ fen, position, orientation, size });
  const [run, setRun] = useState<{ key: string; slides: Slide[] } | null>(null);
  // The last drag-and-drop, on the position it was made from.
  const [dropped, setDropped] = useState<{ from: Square; to: Square; fen: string } | null>(null);

  if (prev.fen !== fen || prev.orientation !== orientation || prev.size !== size) {
    // Same board turned or resized: just show it. A new position: work out what moved.
    const moved = prev.fen !== fen && prev.orientation === orientation && prev.size === size;
    setPrev({ fen, position, orientation, size });
    const drop = dropped?.fen === prev.fen ? dropped : null;
    const slides = moved ? slidesBetween(prev.position, position).filter((s) => !(drop && s.from === drop.from && s.to === drop.to)) : [];
    if (dropped) setDropped(null);
    setRun(slides.length ? { key: fen, slides } : null);
  }

  const markDropped = (from: Square, to: Square) => setDropped({ from, to, fen });
  const finish = (key: string) => setRun((r) => (r?.key === key ? null : r));
  const hidden = useMemo(() => new Set(run?.slides.map((sl) => sl.to) ?? []), [run]);
  return { run, hidden, markDropped, finish };
}

/**
 * One piece gliding from its old square to its new one. Each slide mounts
 * fresh with its own progress, so it starts at the old square on its first
 * frame, and the animation runs on the UI thread without touching React.
 */
function SlidingPiece({ slide, orientation, cell, size, set, onDone }: { slide: Slide; orientation: Color; cell: number; size: number; set: PieceSet; onDone?: () => void }) {
  const progress = useSharedValue(0);
  const a = cellOrigin(slide.from, orientation, cell);
  const b = cellOrigin(slide.to, orientation, cell);
  const ax = a.x + cell / 2 - size / 2;
  const ay = a.y + cell / 2 - size / 2;
  const bx = b.x + cell / 2 - size / 2;
  const by = b.y + cell / 2 - size / 2;

  useEffect(() => {
    progress.set(
      withTiming(1, { duration: SLIDE_MS, easing: SLIDE_EASING }, (finished) => {
        'worklet';
        if (finished && onDone) scheduleOnRN(onDone);
      }),
    );
    // Mounted once per slide (keyed by the move).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moving = useAnimatedStyle(() => ({
    transform: [{ translateX: ax + (bx - ax) * progress.get() }, { translateY: ay + (by - ay) * progress.get() }],
  }));
  // A captured piece stays on its square until the attacker has nearly arrived.
  const fading = useAnimatedStyle(() => ({ opacity: progress.get() < 0.85 ? 1 : (1 - progress.get()) / 0.15 }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, PLACE_ORIGIN]}>
      {slide.captured && (
        <Animated.View style={[placeAt(b.x, b.y, cell, cell, size), fading]}>
          <PieceView type={slide.captured.type} color={slide.captured.color} cell={cell} set={set} />
        </Animated.View>
      )}
      <Animated.View style={[styles.floating, { width: cell, height: cell }, moving]}>
        <PieceView type={slide.piece.type} color={slide.piece.color} cell={cell} set={set} />
      </Animated.View>
    </View>
  );
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

/** Legal-move hint on a square: none, a dot on an empty square, a ring around a piece that can be taken. */
type Hint = 0 | 1 | 2;

interface CellProps {
  sq: Square;
  col: number;
  row: number;
  cell: number;
  size: number;
  /** Piece code ('wn', 'bp') or '' for an empty or hidden square. */
  piece: string;
  set: PieceSet;
  /** Tints over the square, bottom first, joined with '|'. */
  overlays: string;
  /** Drag state on the UI thread: fades this square's piece while it is being dragged away. */
  ui: DragUI;
  hint: Hint;
  hintColor: string;
  rankLabel: number;
  fileLabel: string;
  coordColor: string;
  pickable: boolean;
  crowned: boolean;
  label: string;
}

/**
 * One square: its tints, coordinates, piece and move hint. Its props are plain
 * values, so selecting a piece, a move or the end of a slide re-renders only
 * the few squares that change instead of the whole board.
 */
const SquareCell = memo(function SquareCell(p: CellProps) {
  const { cell } = p;
  const coordSize = Math.max(8, cell * 0.17);
  const coordBox = Math.ceil(coordSize * 1.3);
  return (
    <View accessibilityLabel={p.label} pointerEvents="none" style={[placeAt(p.col * cell, p.row * cell, cell, cell, p.size), PLACE_ORIGIN]}>
      {p.overlays !== '' && p.overlays.split('|').map((c, k) => <View key={k} style={[StyleSheet.absoluteFill, { backgroundColor: c }]} />)}
      {p.rankLabel > 0 && (
        <Text style={[styles.coord, placeAt(cell * 0.02, 0, coordBox, coordBox, cell), { color: p.coordColor, fontSize: coordSize, lineHeight: coordBox }]}>{p.rankLabel}</Text>
      )}
      {p.fileLabel !== '' && (
        <Text style={[styles.coord, placeAt(cell - coordBox - cell * 0.02, cell - coordBox, coordBox, coordBox, cell), { color: p.coordColor, fontSize: coordSize, lineHeight: coordBox }]}>
          {p.fileLabel}
        </Text>
      )}
      {p.piece !== '' && (
        <LiftablePiece ui={p.ui} index={p.row * 8 + p.col}>
          <PieceView color={p.piece[0] as Color} type={p.piece[1] as Piece['type']} cell={cell} set={p.set} />
        </LiftablePiece>
      )}
      {p.pickable && <View style={[StyleSheet.absoluteFill, styles.pickable, { borderWidth: Math.max(2, cell * 0.06), borderRadius: cell * 0.12 }]} />}
      {p.crowned && (
        <View style={[styles.crown, { width: cell * 0.36, height: cell * 0.36, borderRadius: cell * 0.18, top: cell * 0.03, end: cell * 0.03 }]}>
          <Text style={{ fontSize: cell * 0.24, lineHeight: cell * 0.3, color: '#3a2a00' }}>♛</Text>
        </View>
      )}
      {p.hint === 2 && <View style={[StyleSheet.absoluteFill, { borderWidth: cell * 0.075, borderColor: p.hintColor, borderRadius: cell / 2 }]} />}
      {p.hint === 1 && (
        <View style={{ position: 'absolute', left: cell * 0.36, top: cell * 0.36, width: cell * 0.28, height: cell * 0.28, borderRadius: cell, backgroundColor: p.hintColor }} />
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
  const { enabled: dragEnabled, ui: dragUI, ref: dragRef, gesture: dragGesture } = useDrag({ ...props, position, cell, onDropped: slide.markDropped });
  // Right-click arrows and circles (web) on every board you look at closely; thumbnails stay plain.
  const drawn = useDrawnShapes(props.drawable ?? (!!onSquarePress || (!props.hideCoordinates && size >= 160)), fen, cell, orientation);
  // Move sounds on every board; thumbnails and small previews stay quiet (a grid of live games would clatter).
  useBoardSound(fen, props.sound ?? (!props.hideCoordinates && size >= 160));
  const allArrows = props.arrows ? [...props.arrows, ...drawn.arrows] : drawn.arrows;
  const targetSet = look.showLegalMoves ? new Set(targets) : null;
  const premoveSquares = new Set<string>();
  for (const pm of [...(premove ? [premove] : []), ...(props.premoves ?? [])]) {
    premoveSquares.add(pm.from);
    premoveSquares.add(pm.to);
  }
  const threatSet = new Set(threatened);
  const pickable = props.pickable ? new Set(props.pickable) : null;
  const crowned = props.crowned ? new Set(props.crowned) : null;

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
        let overlays = '';
        const tint = (c: string) => (overlays = overlays ? `${overlays}|${c}` : c);
        if (look.highlightLastMove && lastMove && (lastMove.from === sq || lastMove.to === sq)) tint(colors.lastMove);
        if (threatSet.has(sq)) tint(colors.threat);
        if (premoveSquares.has(sq)) tint(PREMOVE_TINT);
        if (selected === sq) tint(colors.selected);
        if (checkSquare === sq) tint(colors.check);
        return (
          <SquareCell
            key={sq}
            sq={sq}
            col={col}
            row={row}
            cell={cell}
            size={size}
            piece={piece && !slide.hidden.has(sq) ? `${piece.color}${piece.type}` : ''}
            set={set}
            overlays={overlays}
            ui={dragUI}
            hint={targetSet?.has(sq) ? (piece ? 2 : 1) : 0}
            hintColor={colors.hint}
            rankLabel={coordinates && col === 0 ? rank : 0}
            fileLabel={coordinates && row === 7 ? FILES[fileIdx] : ''}
            coordColor={isLight ? colors.coordOnLight : colors.coordOnDark}
            pickable={!!pickable?.has(sq)}
            crowned={!!crowned?.has(sq)}
            label={`${sq}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
          />
        );
      })}
      {slide.run?.slides.map((sl, k) => {
        const key = slide.run!.key;
        return (
          <SlidingPiece
            key={`slide-${key}-${sl.from}-${sl.to}`}
            slide={sl}
            orientation={orientation}
            cell={cell}
            size={size}
            set={set}
            onDone={k === 0 ? () => slide.finish(key) : undefined}
          />
        );
      })}
      {dragEnabled && (
        <GestureDetector gesture={dragGesture}>
          <View ref={dragRef} collapsable={false} style={[StyleSheet.absoluteFill, WEB_NO_GESTURES]} />
        </GestureDetector>
      )}
      {dragEnabled && <DropTarget ui={dragUI} cell={cell} size={size} color={colors.hint} />}
      {dragEnabled && <DraggedPieces ui={dragUI} cell={cell} size={size} set={set} />}
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
              <PieceView type={type} color={choice.color} cell={cell * 0.86} set={set} />
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const PieceView = memo(function PieceView({ type, color, cell, set }: { type: Piece['type']; color: Color; cell: number; set: PieceSet }) {
  return <Image source={pieceImage(set, color, type)} style={{ width: cell, height: cell }} resizeMode="contain" accessibilityIgnoresInvertColors />;
});

// On the web, stop the page scrolling or selecting text while a piece is dragged.
const WEB_NO_GESTURES = (Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none', cursor: 'pointer' } : {}) as ViewStyle;

/** How much a picked-up piece grows, so it reads as lifted under a finger. */
const LIFT_SCALE = 1.12;

/** Every piece, so the one under the finger can be chosen on the UI thread. */
const KINDS: { color: Color; type: Piece['type'] }[] = (['w', 'b'] as const).flatMap((color) => (['p', 'n', 'b', 'r', 'q', 'k'] as const).map((type) => ({ color, type })));
const kindOf = (piece: Piece) => KINDS.findIndex((k) => k.color === piece.color && k.type === piece.type);

/**
 * What the UI thread knows about the drag. The gesture writes these on touch
 * and on every pointer move, and the dragged piece, the faded piece left behind
 * and the drop outline read them, so picking up and following the finger never
 * wait for JavaScript or a React render. That matters most on phones in
 * development, where a render of the game screen can take a large fraction of
 * a second.
 */
interface DragUI {
  /** Pointer in board coordinates: the centre of the dragged piece. */
  x: SharedValue<number>;
  y: SharedValue<number>;
  moved: SharedValue<boolean>;
  lift: SharedValue<number>;
  /** Index into KINDS of the held piece; -1 when nothing is held. */
  kind: SharedValue<number>;
  /** Squares as display cells (row * 8 + col, top-left first); -1 for none. */
  from: SharedValue<number>;
  over: SharedValue<number>;
}

/** A square's piece, faded on the UI thread while it is being dragged away. */
function LiftablePiece({ ui, index, children }: { ui: DragUI; index: number; children: ReactNode }) {
  const fade = useAnimatedStyle(() => ({ opacity: ui.kind.get() >= 0 && ui.moved.get() && ui.from.get() === index ? 0.3 : 1 }));
  return <Animated.View style={fade}>{children}</Animated.View>;
}

/**
 * The piece under the finger. All twelve are mounted up front and the held one
 * is shown on the UI thread, so it appears under the finger on the first frame
 * of the drag instead of after a React render.
 */
const DraggedPieces = memo(function DraggedPieces({ ui, cell, size, set }: { ui: DragUI; cell: number; size: number; set: PieceSet }) {
  return KINDS.map((k, i) => <DraggedPiece key={i} ui={ui} kind={i} color={k.color} type={k.type} cell={cell} size={size} set={set} />);
});

function DraggedPiece({ ui, kind, color, type, cell, size, set }: { ui: DragUI; kind: number; color: Color; type: Piece['type']; cell: number; size: number; set: PieceSet }) {
  const follow = useAnimatedStyle(() => {
    const shown = ui.kind.get() === kind && ui.moved.get();
    return {
      opacity: shown ? 1 : 0,
      transform: shown ? [{ translateX: ui.x.get() - size / 2 }, { translateY: ui.y.get() - size / 2 }, { scale: ui.lift.get() }] : [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.floating, { width: cell, height: cell }, follow]}>
      <PieceView type={type} color={color} cell={cell} set={set} />
    </Animated.View>
  );
}

/** Outline on the square a dragged piece would land on, moved on the UI thread. */
function DropTarget({ ui, cell, size, color }: { ui: DragUI; cell: number; size: number; color: string }) {
  const place = useAnimatedStyle(() => {
    const o = ui.over.get();
    const show = ui.moved.get() && o >= 0 && o !== ui.from.get();
    return {
      opacity: show ? 1 : 0,
      transform: [{ translateX: (o % 8) * cell + cell / 2 - size / 2 }, { translateY: Math.floor(o / 8) * cell + cell / 2 - size / 2 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.floating, { width: cell, height: cell, borderWidth: Math.max(2, cell * 0.06), borderColor: color }, place]} />;
}

/**
 * Drag-and-drop on top of tap-to-move, with react-native-gesture-handler and
 * Reanimated so the piece follows the finger on the UI thread at the screen's
 * frame rate, even while JavaScript is busy (a bot thinking, a slow render).
 *
 * One transparent layer over the board owns the gestures, so coordinates are
 * always board-relative. A press that moves past the slop from a movable piece
 * drags it (and selects it, so its legal moves show); a press that doesn't move
 * is a tap, handled like tap-to-move.
 *
 * Picking up, dragging, the drop outline and gliding back from an illegal or
 * cancelled drop all run on the UI thread. JavaScript is only told when a drag
 * starts (to select the piece) and about the drop (to play the move); the board
 * itself never re-renders during a drag.
 */
function useDrag(p: {
  fen: string;
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
  const enabled = !!p.onSquarePress;
  // A drop waiting to see whether the position changes: if it does, the piece is already there.
  const [pending, setPending] = useState<{ fen: string; from: number } | null>(null);
  const ref = useRef<ComponentRef<typeof View>>(null);
  // The gestures are created once; they read the latest props through this ref.
  const latest = useRef(p);
  latest.current = p;

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const moved = useSharedValue(false);
  const lift = useSharedValue(1);
  const kind = useSharedValue(-1);
  const from = useSharedValue(-1);
  const over = useSharedValue(-1);
  const ui = useMemo<DragUI>(() => ({ x, y, moved, lift, kind, from, over }), [x, y, moved, lift, kind, from, over]);
  const cellSV = useSharedValue(p.cell);
  /** Display cell of the movable piece the current press started on; -1 for none. */
  const startCell = useSharedValue(-1);
  /** 1 while a piece is held. */
  const holding = useSharedValue(0);
  /**
   * Per display cell: '.' when nothing there can be picked up, otherwise a letter for the
   * piece ('a' + its KINDS index), so touch-down is decided on the UI thread.
   */
  const movable = useSharedValue('');

  const movableKey =
    enabled && p.canDrag
      ? ORDER[p.orientation]
          .map((sq) => {
            const piece = pieceAt(p.position, sq);
            return piece && p.canDrag!(sq) ? String.fromCharCode(97 + kindOf(piece)) : '.';
          })
          .join('')
      : '';
  useEffect(() => {
    movable.set(movableKey);
  }, [movableKey, movable]);
  useEffect(() => {
    cellSV.set(p.cell);
  }, [p.cell, cellSV]);

  /** UI-thread animations, also callable from JavaScript. */
  const anim = useMemo(() => {
    const putDown = () => {
      'worklet';
      kind.set(-1);
      moved.set(false);
      from.set(-1);
      over.set(-1);
    };
    /** Glides the held piece back to its square, then puts it down. */
    const snapBack = (idx: number) => {
      'worklet';
      const c = cellSV.get();
      const timing = { duration: SNAP_BACK_MS, easing: SLIDE_EASING };
      lift.set(withTiming(1, timing));
      x.set(withTiming((idx % 8) * c + c / 2, timing));
      y.set(
        withTiming(Math.floor(idx / 8) * c + c / 2, timing, (finished) => {
          'worklet';
          if (finished) putDown();
        }),
      );
    };
    return { putDown, snapBack };
  }, [x, y, lift, kind, moved, from, over, cellSV]);

  const js = useMemo(() => {
    const squareOfCell = (idx: number) => ORDER[latest.current.orientation][idx];
    return {
      /** A piece started following the finger: select it so its legal moves show while dragging. */
      dragStart(idx: number) {
        haptic('pickup');
        setPending(null);
        const { selected, onSquarePress } = latest.current;
        const sq = squareOfCell(idx);
        if (selected !== sq) onSquarePress?.(sq);
      },
      drop(overIdx: number, fromIdx: number) {
        const { onPieceDrop, onDropped, fen } = latest.current;
        const sq = squareOfCell(fromIdx);
        // Dropped back on its square or off the board: the UI thread already glides it home,
        // and it stays selected for a tap move.
        const to = overIdx >= 0 ? squareOfCell(overIdx) : null;
        if (!to || to === sq) return;
        onDropped?.(sq, to);
        onPieceDrop?.(sq, to);
        // The piece stays where it was dropped until the new position shows, or glides back (below).
        setPending({ fen, from: fromIdx });
      },
      tap(idx: number) {
        latest.current.onSquarePress?.(squareOfCell(idx));
      },
      cancel() {
        setPending(null);
      },
    };
  }, []);

  // After a drop: if the position changed (the move was played or queued as a premove), the
  // piece is drawn on its new square in this commit, so the floating one is put down now; if
  // not (an illegal square, a promotion to pick), it glides back to where it came from.
  useLayoutEffect(() => {
    if (!pending) return;
    setPending(null);
    if (pending.fen !== p.fen) anim.putDown();
    else anim.snapBack(pending.from);
  }, [pending, p.fen, anim]);

  // Two plain gestures, no manual activation or raw touch callbacks (iOS did not deliver those
  // reliably): a press that moves past the slop is a drag, a press that doesn't is a tap. Taps go
  // to onSquarePress for every square, which selects, deselects or moves like tap-to-move.
  const pan = usePanGesture(
    useMemo(
      () => ({
        enabled,
        minDistance: DRAG_SLOP,
        mouseButton: MouseButton.LEFT,
        shouldCancelWhenOutside: false,
        maxPointers: 1,
        onBegin: (e: { x: number; y: number }) => {
          'worklet';
          // Where the press started: the piece there (if it can move) is the one that gets dragged.
          const c = cellSV.get();
          const col = Math.floor(e.x / c);
          const row = Math.floor(e.y / c);
          const idx = col >= 0 && col < 8 && row >= 0 && row < 8 ? row * 8 + col : -1;
          const code = idx < 0 ? '.' : movable.get().charAt(idx);
          startCell.set(code === '' || code === '.' ? -1 : idx);
        },
        onActivate: (e: { x: number; y: number }) => {
          'worklet';
          const idx = startCell.get();
          if (idx < 0 || holding.get() === 1) return;
          const code = movable.get().charAt(idx);
          if (code === '' || code === '.') return;
          holding.set(1);
          x.set(e.x);
          y.set(e.y);
          kind.set(code.charCodeAt(0) - 97);
          from.set(idx);
          over.set(idx);
          moved.set(true);
          lift.set(withTiming(LIFT_SCALE, { duration: 90 }));
          scheduleOnRN(js.dragStart, idx);
        },
        onUpdate: (e: { x: number; y: number }) => {
          'worklet';
          if (holding.get() !== 1) return;
          x.set(e.x);
          y.set(e.y);
          const c = cellSV.get();
          const col = Math.floor(e.x / c);
          const row = Math.floor(e.y / c);
          over.set(col >= 0 && col < 8 && row >= 0 && row < 8 ? row * 8 + col : -1);
        },
        onDeactivate: (e: { canceled: boolean }) => {
          'worklet';
          if (holding.get() !== 1) return;
          holding.set(0);
          const target = over.get();
          const origin = from.get();
          over.set(-1);
          if (e.canceled) {
            anim.putDown();
            scheduleOnRN(js.cancel);
            return;
          }
          // Back on its own square or off the board: glide home right here, without waiting for JavaScript.
          if (target < 0 || target === origin) anim.snapBack(origin);
          scheduleOnRN(js.drop, target, origin);
        },
        onFinalize: () => {
          'worklet';
          startCell.set(-1);
          if (holding.get() !== 1) return;
          holding.set(0);
          anim.putDown();
          scheduleOnRN(js.cancel);
        },
      }),
      // Shared values, `anim` and `js` are stable; only switching the board on or off rebuilds the gesture.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [enabled],
    ),
  );

  const tap = useTapGesture(
    useMemo(
      () => ({
        enabled,
        mouseButton: MouseButton.LEFT,
        maxDistance: DRAG_SLOP,
        // Any press that doesn't wander is a tap, however long it is held.
        maxDuration: 60_000,
        onActivate: (e: { x: number; y: number }) => {
          'worklet';
          const c = cellSV.get();
          const col = Math.floor(e.x / c);
          const row = Math.floor(e.y / c);
          if (col >= 0 && col < 8 && row >= 0 && row < 8) scheduleOnRN(js.tap, row * 8 + col);
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [enabled],
    ),
  );

  // Whichever recognises first wins: moving past the slop is a drag (of the piece the press began on), anything else a tap.
  const gesture = useCompetingGestures(pan, tap);

  // Right-click cancels a premove or selection, like most chess sites.
  useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if (Platform.OS !== 'web' || !enabled || !node?.addEventListener) return;
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      anim.putDown();
      js.cancel();
      latest.current.onCancel?.();
    };
    node.addEventListener('contextmenu', onContext);
    return () => node.removeEventListener('contextmenu', onContext);
  }, [enabled, js, anim]);

  return { enabled, ui, ref, gesture };
}

const styles = StyleSheet.create({
  board: { overflow: 'hidden' },
  edge: { borderWidth: StyleSheet.hairlineWidth * 2 },
  coord: { fontWeight: '700', letterSpacing: 0.2, textAlign: 'center' },
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
