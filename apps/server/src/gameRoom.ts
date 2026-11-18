import {
  Game,
  createClock,
  isFlagged,
  outcomeFor,
  pressClock,
  remaining,
  startClock,
  stopClock,
  type ClockState,
  type Color,
  type GameOutcome,
  type GameSnapshot,
  type GameTournamentRef,
  type PlayedMove,
  type PlayerInfo,
  type TimeControl,
  START_FEN,
} from '@chessmate/core';

export type MoveError = 'not_your_turn' | 'illegal_move' | 'stale_ply' | 'game_over';

export interface RoomEvents {
  onMove(room: GameRoom, move: PlayedMove): void;
  onEnd(room: GameRoom, outcome: GameOutcome): void;
  onDrawOffer(room: GameRoom, by: Color): void;
}

/** Time a player has to make the first move before the game is aborted. */
export const FIRST_MOVE_TIMEOUT_MS = 30_000;

/**
 * Authoritative state for a single game. All time arguments are injected so
 * the room is deterministic under test; the server drives `checkTime` from a
 * timer.
 */
export class GameRoom {
  readonly game: Game;
  clock: ClockState;
  outcome: GameOutcome | null = null;
  drawOfferBy: Color | null = null;
  readonly createdAt: number;
  /** Server-measured think time per ply (ms), for fair-play timing analysis. */
  readonly thinkMs: number[] = [];
  private lastMoveAt: number;
  /** Set when the game belongs to a tournament: no aborts and no rematches. */
  tournament: GameTournamentRef | undefined;
  /** True when staff (or a cancelled tournament) ended the game with no result. */
  terminated = false;
  /** Rejected move attempts per color (illegal, wrong turn, stale). */
  readonly rejectedMoves: Record<Color, number> = { w: 0, b: 0 };

  constructor(
    readonly id: string,
    readonly white: PlayerInfo,
    readonly black: PlayerInfo,
    readonly timeControl: TimeControl,
    readonly rated: boolean,
    now: number,
    private readonly events: RoomEvents,
    readonly initialFen: string = START_FEN,
  ) {
    this.game = new Game(initialFen);
    this.clock = createClock(timeControl);
    this.createdAt = now;
    this.lastMoveAt = now;
  }

  colorOf(playerId: string): Color | null {
    if (this.white.id === playerId) return 'w';
    if (this.black.id === playerId) return 'b';
    return null;
  }

  /** Clocks start only after each side has moved once; until then the game can be aborted. */
  get abortable(): boolean {
    return this.game.ply < 2 && !this.outcome;
  }

  move(playerId: string, uci: string, ply: number, now: number): PlayedMove | MoveError {
    const res = this.tryMove(playerId, uci, ply, now);
    const color = this.colorOf(playerId);
    if (typeof res === 'string' && color && res !== 'game_over') this.rejectedMoves[color]++;
    return res;
  }

  private tryMove(playerId: string, uci: string, ply: number, now: number): PlayedMove | MoveError {
    if (this.outcome) return 'game_over';
    const color = this.colorOf(playerId);
    if (!color || color !== this.game.turn) return 'not_your_turn';
    if (!Number.isInteger(ply) || ply !== this.game.ply) return 'stale_ply';
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return 'illegal_move';
    if (this.checkTime(now)) return 'game_over';

    const played = this.game.move(uci);
    if (!played) return 'illegal_move';
    // A promotion suffix on a non-promotion move, or a missing one on a promotion, is not the move the client meant.
    if ((uci.length === 5) !== !!played.promotion) {
      this.game.undo();
      return 'illegal_move';
    }

    if (this.game.ply <= 1) {
      // White's first move: black's clock is still not running.
      this.clock = { ...this.clock, startedAt: now };
    } else if (this.game.ply === 2) {
      this.clock = startClock(this.clock, 'w', now);
    } else {
      const r = pressClock(this.clock, color, now);
      this.clock = r.clock;
      if (r.flagged) {
        this.game.undo();
        this.flag(color, now);
        return 'game_over';
      }
    }
    this.thinkMs.push(Math.max(0, now - this.lastMoveAt));
    this.lastMoveAt = now;
    this.drawOfferBy = this.drawOfferBy === color ? this.drawOfferBy : null;
    this.events.onMove(this, played);

    const end = this.game.boardOutcome();
    if (end) this.finish(end, now);
    return played;
  }

  resign(playerId: string, now: number): boolean {
    const color = this.colorOf(playerId);
    if (!color || this.outcome) return false;
    this.finish(outcomeFor('resignation', color === 'w' ? 'b' : 'w'), now);
    return true;
  }

  abort(playerId: string, now: number): boolean {
    if (!this.colorOf(playerId) || !this.abortable || this.tournament) return false;
    this.finish(outcomeFor('aborted', null), now);
    return true;
  }

  /** Staff ends the game with no result and no rating change (abuse, server trouble). */
  terminate(now: number): boolean {
    if (this.outcome) return false;
    this.terminated = true;
    this.finish(outcomeFor('aborted', null), now);
    return true;
  }

  offerDraw(playerId: string): boolean {
    const color = this.colorOf(playerId);
    if (!color || this.outcome || this.drawOfferBy === color) return false;
    if (this.drawOfferBy && this.drawOfferBy !== color) return false;
    this.drawOfferBy = color;
    this.events.onDrawOffer(this, color);
    return true;
  }

  acceptDraw(playerId: string, now: number): boolean {
    const color = this.colorOf(playerId);
    if (!color || this.outcome || !this.drawOfferBy || this.drawOfferBy === color) return false;
    this.finish(outcomeFor('draw_agreement', null), now);
    return true;
  }

  declineDraw(playerId: string): boolean {
    const color = this.colorOf(playerId);
    if (!color || !this.drawOfferBy || this.drawOfferBy === color) return false;
    this.drawOfferBy = null;
    return true;
  }

  /** Ends the game for a player who left and did not come back. */
  abandon(playerId: string, now: number): boolean {
    const color = this.colorOf(playerId);
    if (!color || this.outcome) return false;
    if (this.abortable) this.finish(outcomeFor('aborted', null), now);
    else this.finish(outcomeFor('abandoned', color === 'w' ? 'b' : 'w'), now);
    return true;
  }

  /** Checks flags and first-move timeouts. Returns true if the game ended. */
  checkTime(now: number): boolean {
    if (this.outcome) return true;
    if (this.abortable) {
      const since = this.clock.startedAt ?? this.createdAt;
      if (now - since > FIRST_MOVE_TIMEOUT_MS) {
        this.finish(outcomeFor('aborted', null), now);
        return true;
      }
      return false;
    }
    const flagged = isFlagged(this.clock, now);
    if (flagged) {
      this.flag(flagged, now);
      return true;
    }
    return false;
  }

  /** Milliseconds until the next time-based event, for scheduling a timer. */
  msUntilNextDeadline(now: number): number | null {
    if (this.outcome) return null;
    if (this.abortable) return Math.max(0, (this.clock.startedAt ?? this.createdAt) + FIRST_MOVE_TIMEOUT_MS - now);
    if (!this.clock.running) return null;
    return remaining(this.clock, this.clock.running, now);
  }

  private flag(color: Color, now: number) {
    const opponent: Color = color === 'w' ? 'b' : 'w';
    const reason = this.game.hasMatingMaterial(opponent) ? 'timeout' : 'timeout_vs_insufficient';
    this.clock = { ...stopClock(this.clock, now), remainingMs: { ...this.clock.remainingMs, [color]: 0 } };
    this.finish(outcomeFor(reason, reason === 'timeout' ? opponent : null), now);
  }

  private finish(outcome: GameOutcome, now: number) {
    if (this.outcome) return;
    this.clock = stopClock(this.clock, now);
    this.outcome = outcome;
    this.drawOfferBy = null;
    this.events.onEnd(this, outcome);
  }

  snapshot(now: number): GameSnapshot {
    return {
      gameId: this.id,
      white: this.white,
      black: this.black,
      timeControl: this.timeControl,
      rated: this.rated,
      initialFen: this.initialFen,
      moves: this.game.uciHistory(),
      clock: this.clock,
      serverNow: now,
      drawOfferBy: this.drawOfferBy,
      outcome: this.outcome,
      ...(this.tournament ? { tournament: this.tournament } : {}),
    };
  }
}
