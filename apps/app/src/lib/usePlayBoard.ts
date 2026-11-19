import { Game, premoveDests, secretQueenTargets, type Color, type Square } from '@chessmate/core';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import type { PromotionPiece } from '@/components/Board';
import { useSettings } from '@/features/account/settingsStore';

import { haptic } from './haptics';
import { promotionChoice, type PendingPromotion } from './useBoardInteraction';
import { playClient, type GameView, type Premove } from './playClient';

/** On the web several premoves can be queued; on phones one (a new one replaces it). */
const MULTI_PREMOVE = Platform.OS === 'web';

/**
 * The position after the queued premoves, with pieces simply moved (no
 * legality: the opponent has not moved yet). Shown on the board and used for
 * the next premove's targets, so premoves can chain.
 */
export function positionAfterPremoves(fen: string, premoves: Premove[], color: Color): string {
  if (premoves.length === 0) return fen;
  try {
    const g = new Game(fen);
    for (const pm of premoves) {
      const piece = g.raw.get(pm.from as Square);
      // Never take a king off the board: the position would stop being a chess position.
      if (!piece || g.raw.get(pm.to as Square)?.type === 'k') break;
      g.raw.remove(pm.from as Square);
      g.raw.remove(pm.to as Square);
      g.raw.put(pm.promotion ? { type: pm.promotion, color } : piece, pm.to as Square);
    }
    const out = g.raw.fen();
    new Game(out); // throws if chess.js would not accept it
    return out;
  } catch {
    return fen;
  }
}

/**
 * Tap-to-move and drag-and-drop for a live game. On your turn it shows legal
 * moves; while the opponent is thinking it queues a premove when premoves are
 * on in settings. Tap the queued piece or any empty spot, or right-click on
 * the web, to cancel it.
 */
export function usePlayBoard(view: GameView | null, onMove: (uci: string) => boolean = (uci) => playClient.move(uci)) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [promoting, setPromoting] = useState<(PendingPromotion & { premove: boolean }) | null>(null);
  const { premoves: premovesOn, autoQueen } = useSettings().gameplay;
  const fen = view?.fen;
  const game = useMemo(() => (fen ? new Game(fen) : null), [fen]);
  const live = !!view && !view.outcome && !!game;
  const myTurn = live && game!.turn === view!.you;
  const secretQueen = view?.variant === 'secretQueen';
  // Secret Queen: no premoves (the server may refuse a move because of the hidden queen).
  const canPremove = live && !myTurn && premovesOn && !secretQueen;
  // Secret Queen: until the player has chosen, tapping one of their pawns picks it.
  const [repicking, setRepicking] = useState(false);
  const picking = live && secretQueen && !!view?.canPickSecret && (!view.secret || repicking);
  const queued = view?.premoves ?? [];
  const hasQueue = queued.length > 0;

  // Turning premoves off drops anything already queued.
  useEffect(() => {
    if (!premovesOn && hasQueue) playClient.clearPremoves();
  }, [premovesOn, hasQueue]);

  // While premoves wait, the board shows the pieces where they will go and new premoves start from there.
  const you = view?.you ?? 'w';
  const premoveFen = useMemo(() => (fen && !myTurn ? positionAfterPremoves(fen, queued, you) : fen), [fen, myTurn, queued, you]);
  const premoveGame = useMemo(() => (premoveFen ? new Game(premoveFen) : null), [premoveFen]);
  const pieceAt = (sq: Square) => (myTurn ? game?.raw.get(sq) : premoveGame?.raw.get(sq));

  const destsFrom = (from: Square): Square[] =>
    !live || picking
      ? []
      : myTurn
        ? secretQueen
          ? secretQueenTargets(fen!, view!.you, from, view!.secret)
          : game!.legalMoves(from).map((m) => m.to)
        : canPremove && premoveFen ? premoveDests(premoveFen, view!.you, from) : [];
  const targets: Square[] = selected ? destsFrom(selected) : [];

  const movable = (sq: Square) => {
    const piece = pieceAt(sq);
    return !!piece && !!view && piece.color === view.you && (myTurn || canPremove);
  };

  /** A pawn reaching the last rank (for premoves, where the move is not legal yet). */
  const isPromotion = (from: Square, to: Square) => {
    const piece = pieceAt(from);
    return piece?.type === 'p' && (to[1] === '8' || to[1] === '1');
  };

  const commit = (from: Square, to: Square): boolean => {
    if (!destsFrom(from).includes(to)) return false;
    if (myTurn && secretQueen) {
      // A pawn step to the last rank promotes; anything else the secret queen does is a queen move.
      const pawnPromo = game!.legalMoves(from).find((m) => m.to === to)?.promotion;
      if (pawnPromo && !autoQueen) {
        setPromoting({ fen: view!.fen, from, to, color: view!.you, premove: false });
        return true;
      }
      return onMove(`${from}${to}${pawnPromo ? 'q' : ''}`);
    }
    if (myTurn) {
      const move = game!.legalMoves(from).find((m) => m.to === to);
      if (!move) return false;
      if (move.promotion && !autoQueen) {
        setPromoting({ fen: view!.fen, from, to, color: view!.you, premove: false });
        return true;
      }
      return onMove(`${move.from}${move.to}${move.promotion ? 'q' : ''}`);
    }
    if (isPromotion(from, to) && !autoQueen) {
      setPromoting({ fen: view!.fen, from, to, color: view!.you, premove: true });
      return true;
    }
    playClient.addPremove({ from, to }, MULTI_PREMOVE);
    return true;
  };

  const pick = (p: PendingPromotion & { premove: boolean }, piece: PromotionPiece) => {
    setPromoting(null);
    if (p.premove) playClient.addPremove({ from: p.from, to: p.to, promotion: piece }, MULTI_PREMOVE);
    else onMove(`${p.from}${p.to}${piece}`);
  };
  const promotion = fen ? promotionChoice(promoting, fen, pick, () => setPromoting(null)) : null;

  const onSquarePress = (sq: Square) => {
    if (!live || !view || !game) return;
    if (picking) {
      const piece = game.raw.get(sq);
      if (piece?.type === 'p' && piece.color === view.you) {
        playClient.pickSecret(sq);
        setRepicking(false);
      }
      return;
    }
    if (selected && targets.includes(sq)) {
      commit(selected, sq);
      setSelected(null);
      return;
    }
    if (!myTurn && hasQueue && !movable(sq)) playClient.clearPremoves();
    if (movable(sq)) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  const onPieceDrop = (from: Square, to: Square) => {
    setSelected(null);
    if (!live || !movable(from)) return;
    if (!commit(from, to)) haptic('illegal');
  };

  const cancel = () => {
    setSelected(null);
    setPromoting(null);
    playClient.clearPremoves();
  };

  /** What the board should show: the live position, or the position after queued premoves. */
  const displayFen = !myTurn && hasQueue ? premoveFen : fen;

  return {
    selected,
    targets,
    onSquarePress,
    myTurn,
    canPremove,
    cancel,
    promotion,
    displayFen,
    premoves: queued,
    /** Secret Queen: waiting for the player to tap a pawn. */
    picking,
    /** Secret Queen: choose a different pawn (before the first move). */
    repick: () => setRepicking(true),
    dragProps: { canDrag: movable, onPieceDrop, onCancel: cancel, promotion },
  };
}
