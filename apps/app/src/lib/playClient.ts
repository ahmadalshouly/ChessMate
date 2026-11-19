import {
  FIRST_MOVE_TIMEOUT_MS,
  Game,
  PROTOCOL_VERSION,
  decodeServer,
  encode,
  remaining,
  timeCategory,
  type AccountRestriction,
  type GameVariant,
  type SecretReveal,
  type SecretSquares,
  type Challenge,
  type ChallengeColor,
  type ChallengeEndReason,
  type ClientMessage,
  type ClockState,
  type Color,
  type ColorChoice,
  type GameOutcome,
  type GameSnapshot,
  type LobbyState,
  type OpenGame,
  type PlayedMove,
  type PlayerInfo,
  type Rating,
  type ServerMessage,
  type Square,
  type TimeControl,
} from '@chessmate/core';
import { useSyncExternalStore } from 'react';

import { SERVER_URL } from './config';
import { gameEndFeedback, gameStartFeedback, moveFeedback } from './feedback';
import { haptic } from './haptics';
import { playSound } from './sounds';
import { translate } from '@/i18n';

/**
 * One realtime connection for the whole app, shared by the lobby and the game
 * screen. Holds the authoritative mirror of the current game, the player's seek
 * or open game, and lobby stats; screens read it with `usePlay()`.
 */

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface SeekRequest {
  timeControl: TimeControl;
  rated: boolean;
  /** Fixed ± rating window; undefined widens automatically. */
  range?: number;
  /** Side to play; 'random' or undefined pairs with anyone. */
  color?: ColorChoice;
  /** Rules variant (Secret Queen is always casual). */
  variant?: GameVariant;
}

export interface SeekStatus {
  window: number | null;
  poolSize: number;
  waitedMs: number;
  /** Local time the status arrived, to keep the wait timer ticking between updates. */
  at: number;
}

/** A queued move; `promotion` is the piece picked for a pawn reaching the last rank (queen if absent). */
export interface Premove {
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

export interface GameView {
  gameId: string;
  you: Color;
  white: PlayerInfo;
  black: PlayerInfo;
  timeControl: TimeControl;
  rated: boolean;
  fen: string;
  history: PlayedMove[];
  clock: ClockState;
  /** Add to Date.now() to get server time. */
  clockOffset: number;
  outcome: GameOutcome | null;
  ratingChange?: Record<Color, { before: Rating; after: Rating }>;
  /** Why the result did not change ratings ('casual', 'guest', 'too_short', ...). */
  unrated?: string;
  drawOfferBy: Color | null;
  opponentConnected: boolean;
  /** Server time at which the absent opponent forfeits. */
  opponentAbandonAt: number | null;
  rematchBy: Color | null;
  rematchDeclined: boolean;
  /** Queued moves, played one per opponent move; the first is next. Phones queue one, the web several. */
  premoves: Premove[];
  /** Server time by which the side to move must make its first move; null once both have moved. */
  firstMoveDeadline: number | null;
  /** The tournament this game belongs to, if any. */
  tournamentId: string | null;
  variant: GameVariant;
  /** Secret Queen: your secret pawn (only you know it), null once revealed, captured or before you pick. */
  secret: Square | null;
  /** Secret Queen: you can still pick or change it (before your first move). */
  canPickSecret: boolean;
  /** Secret Queen: what has been revealed so far. */
  reveals: SecretReveal[];
  /** Secret Queen: both secret pawns, shown when the game ends. */
  endSecrets: SecretSquares | null;
  /** Secret Queen: what the latest move (or refused move) revealed, for a notice. */
  lastReveals: SecretReveal[];
}

export interface PlayState {
  connection: ConnectionStatus;
  me: PlayerInfo | null;
  lobby: LobbyState | null;
  seek: SeekRequest | null;
  seekStatus: SeekStatus | null;
  openGame: OpenGame | null;
  game: GameView | null;
  error: string | null;
  /** Challenges involving this player, plus any invite looked up by link, keyed by id. */
  challenges: Record<string, Challenge>;
  /** Why a challenge went away, keyed by id (declined, cancelled, expired, accepted). */
  challengeEnded: Record<string, ChallengeEndReason>;
  /** Set when the server closed this account (fair play); no reconnects after that. */
  closedReason: string | null;
  /** Set while the account may not play online (closed for fair play); it can still watch and analyse. */
  restricted: AccountRestriction | null;
}

const TOKEN_KEY = 'chessmate.playToken';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function freshGuestToken() {
  return `guest:Guest${Math.floor(Math.random() * 9000 + 1000)}`;
}

/** A Secret Queen move as the board needs it, from the server's public record. */
function secretEntry(p: { uci: string; san: string; fen: string }, fenBefore: string): PlayedMove {
  const color: Color = fenBefore.split(' ')[1] === 'b' ? 'b' : 'w';
  return {
    san: p.san,
    uci: p.uci,
    from: p.uci.slice(0, 2) as Square,
    to: p.uci.slice(2, 4) as Square,
    color,
    piece: '',
    promotion: p.uci[4],
    fenAfter: p.fen,
    isCheck: /[+#]$/.test(p.san),
  };
}

function secretHistory(positions: { uci: string; san: string; fen: string }[], initialFen: string): PlayedMove[] {
  const out: PlayedMove[] = [];
  let before = initialFen;
  for (const p of positions) {
    out.push(secretEntry(p, before));
    before = p.fen;
  }
  return out;
}

class PlayClient {
  private state: PlayState = {
    connection: 'connecting',
    me: null,
    lobby: null,
    seek: null,
    seekStatus: null,
    openGame: null,
    game: null,
    error: null,
    challenges: {},
    challengeEnded: {},
    closedReason: null,
    restricted: null,
  };
  private listeners = new Set<() => void>();
  /** Raw server message listeners (chat, etc.) so features can live in their own hooks. */
  private messageListeners = new Set<(m: ServerMessage) => void>();
  /** Supplies the signed-in player's access token (refreshed as needed); null for guests. */
  private tokenProvider: (() => Promise<string | null>) | null = null;
  private ws: WebSocket | null = null;
  private game = new Game();
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private lobbySubs = 0;
  private started = false;
  private token: string;
  /** Token set by the accounts layer; wins over guest tokens. */
  private accountToken: string | null = null;

  constructor() {
    this.token = storage()?.getItem(TOKEN_KEY) ?? freshGuestToken();
  }

  // ---- store plumbing ----

  getState = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    this.start();
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<PlayState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private patchGame(patch: Partial<GameView>) {
    if (this.state.game) this.set({ game: { ...this.state.game, ...patch } });
  }

  /** The header shows the blitz rating sent on connect; keep it current after a rated blitz game. */
  private applyMyRating(after: number | undefined) {
    const g = this.state.game;
    if (after === undefined || !g || !this.state.me || timeCategory(g.timeControl) !== 'blitz') return;
    this.set({ me: { ...this.state.me, rating: after, provisional: this.state.me.provisional } });
  }

  // ---- connection ----

  /** Signed-in session token from the accounts layer; reconnects as that player. */
  setAccountToken(token: string | null) {
    this.accountToken = token;
    if (this.started) this.ws?.close();
  }

  /**
   * Lets the accounts layer hand over a fresh access token on every (re)connect.
   * Call with `reconnect` when the player signs in or out.
   */
  setTokenProvider(provider: (() => Promise<string | null>) | null, reconnect = false) {
    this.tokenProvider = provider;
    if (reconnect && this.started) this.ws?.close();
  }

  /** Listens to every server message; returns the unsubscribe function. */
  onServerMessage = (fn: (m: ServerMessage) => void) => {
    this.messageListeners.add(fn);
    return () => void this.messageListeners.delete(fn);
  };

  private start() {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  private connect() {
    clearTimeout(this.retryTimer);
    let sock: WebSocket;
    try {
      sock = new WebSocket(SERVER_URL);
    } catch {
      return this.scheduleReconnect();
    }
    this.ws = sock;
    this.set({ connection: 'connecting' });
    sock.onopen = async () => {
      this.retry = 0;
      let account: string | null = null;
      try {
        account = (await this.tokenProvider?.()) ?? null;
      } catch {
        account = null;
      }
      if (sock.readyState === WebSocket.OPEN) sock.send(encode({ t: 'hello', v: PROTOCOL_VERSION, token: account ?? this.accountToken ?? this.token }));
    };
    sock.onmessage = (ev) => {
      const m = decodeServer(String(ev.data));
      if (m) this.onMessage(m);
    };
    sock.onclose = (ev) => {
      if (this.ws !== sock) return;
      this.ws = null;
      // 4010: account closed for a fair-play violation. Reconnecting would only be refused again.
      if (ev.code === 4010) {
        return this.set({ connection: 'offline', closedReason: translate('server.closedFairPlay') });
      }
      // 4011: account closed by staff.
      if (ev.code === 4011) {
        return this.set({ connection: 'offline', closedReason: translate('server.accountClosed') });
      }
      if (ev.code === 4003 && !this.accountToken) {
        // Resume token expired (server restarted): start over as a new guest.
        this.token = freshGuestToken();
        storage()?.removeItem(TOKEN_KEY);
      }
      this.set({ connection: 'offline' });
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    const delay = Math.min(8_000, 400 * 2 ** this.retry++);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  send = (m: ClientMessage) => {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encode(m));
  };

  /** Re-establishes lobby subscription, seek and open game after a reconnect. */
  private restore() {
    if (this.lobbySubs > 0) this.send({ t: 'lobbySub' });
    const g = this.state.game;
    if (g && !g.outcome) return; // the server resumes the game itself
    if (this.state.seek) this.send({ t: 'seek', ...this.state.seek });
    const og = this.state.openGame;
    if (og) this.send({ t: 'createOpenGame', timeControl: og.timeControl, rated: og.rated, color: og.color, range: og.range });
  }

  // ---- server messages ----

  private onMessage(m: ServerMessage) {
    for (const fn of this.messageListeners) fn(m);
    switch (m.t) {
      case 'welcome':
        if (m.resumeToken) {
          this.token = m.resumeToken;
          storage()?.setItem(TOKEN_KEY, m.resumeToken);
        }
        this.set({ connection: 'online', me: m.player, error: null, restricted: m.restricted ?? null });
        return this.restore();
      case 'restricted':
        return this.set({ restricted: m.reason, seek: null, seekStatus: null, openGame: null });
      case 'lobby':
        return this.set({ lobby: m.lobby });
      case 'seeking':
        return this.set({ seek: this.state.seek ?? { timeControl: m.timeControl, rated: false } });
      case 'seekStatus':
        return this.set({ seekStatus: { window: m.window, poolSize: m.poolSize, waitedMs: m.waitedMs, at: Date.now() } });
      case 'seekCancelled':
        return this.set({ seek: null, seekStatus: null });
      case 'openGameCreated':
        return this.set({ openGame: m.game });
      case 'openGameCancelled':
        return this.set({ openGame: null });
      case 'gameStart': {
        const same = this.state.game?.gameId === m.game.gameId;
        this.load(m.game, m.you);
        this.set({ seek: null, seekStatus: null, openGame: null });
        if (!same) gameStartFeedback();
        return;
      }
      case 'gameState':
        if (this.state.game?.gameId === m.game.gameId) this.load(m.game, this.state.game.you);
        return;
      case 'moved':
        return this.onMoved(m);
      case 'drawOffered':
        return this.patchGame({ drawOfferBy: m.by });
      case 'drawDeclined':
        return this.patchGame({ drawOfferBy: null });
      case 'opponentConnection':
        return this.patchGame({ opponentConnected: m.connected, opponentAbandonAt: m.connected ? null : (m.abandonAt ?? null) });
      case 'gameOver':
        if (this.state.game?.gameId !== m.gameId) return;
        gameEndFeedback(m.outcome.winner === null ? 'draw' : m.outcome.winner === this.state.game.you ? 'win' : 'loss');
        this.applyMyRating(m.ratingChange?.[this.state.game.you]?.after.rating);
        return this.patchGame({
          outcome: m.outcome,
          ratingChange: m.ratingChange,
          unrated: m.unrated,
          drawOfferBy: null,
          premoves: [],
          opponentAbandonAt: null,
          firstMoveDeadline: null,
          endSecrets: m.secrets ?? null,
          canPickSecret: false,
          clock: { ...this.state.game.clock, running: null, startedAt: null },
        });
      case 'secret':
        if (this.state.game?.gameId !== m.gameId) return;
        return this.patchGame({ secret: m.square, canPickSecret: m.canPick });
      case 'rematchOffered':
        return this.patchGame({ rematchBy: m.by, rematchDeclined: false });
      case 'rematchDeclined':
        return this.patchGame({ rematchBy: null, rematchDeclined: true });
      case 'challenge':
        return this.set({ challenges: { ...this.state.challenges, [m.challenge.id]: m.challenge }, error: null });
      case 'challengeGone': {
        const { [m.id]: _gone, ...rest } = this.state.challenges;
        return this.set({ challenges: rest, challengeEnded: { ...this.state.challengeEnded, [m.id]: m.reason } });
      }
      case 'error':
        if (m.code === 'chat_restricted') return; // shown by the chat panel
        if (m.id !== undefined) return; // engine analysis errors belong to the analysis screen
        return this.set({ error: m.message });
      default:
        return;
    }
  }

  private load(s: GameSnapshot, you: Color) {
    const prev = this.state.game?.gameId === s.gameId ? this.state.game : null;
    const secretQueen = s.variant === 'secretQueen';
    // Secret Queen positions come from the server (pawns may move like queens); standard games replay the moves.
    this.game = secretQueen ? new Game(s.fen ?? s.initialFen) : Game.fromUciMoves(s.moves, s.initialFen);
    const history = secretQueen ? secretHistory(s.positions ?? [], s.initialFen) : this.game.history();
    this.set({
      game: {
        gameId: s.gameId,
        you,
        white: s.white,
        black: s.black,
        timeControl: s.timeControl,
        rated: s.rated,
        fen: secretQueen ? (s.fen ?? s.initialFen) : this.game.fen,
        history,
        clock: s.clock,
        clockOffset: s.serverNow - Date.now(),
        outcome: s.outcome,
        drawOfferBy: s.drawOfferBy,
        opponentConnected: prev?.opponentConnected ?? true,
        opponentAbandonAt: prev?.opponentAbandonAt ?? null,
        ratingChange: prev?.ratingChange,
        unrated: prev?.unrated,
        rematchBy: null,
        rematchDeclined: false,
        premoves: prev?.premoves ?? [],
        firstMoveDeadline: s.outcome ? null : (s.firstMoveDeadline ?? null),
        tournamentId: s.tournamentId ?? null,
        variant: s.variant ?? 'standard',
        secret: prev?.secret ?? null,
        canPickSecret: prev?.canPickSecret ?? (secretQueen && !s.outcome),
        reveals: s.reveals ?? [],
        endSecrets: prev?.endSecrets ?? null,
        // A reveal without a move (a refused move) arrives as a fresh snapshot.
        lastReveals: prev && (s.reveals?.length ?? 0) > prev.reveals.length ? (s.reveals ?? []).slice(prev.reveals.length) : (prev?.lastReveals ?? []),
      },
      error: null,
    });
  }

  private onMoved(m: Extract<ServerMessage, { t: 'moved' }>) {
    const view = this.state.game;
    if (!view || view.gameId !== m.gameId) return;
    if (view.variant === 'secretQueen' && m.fen) {
      // The server is the only one who knows both secrets: take its position as it is.
      if (view.history.length !== m.ply - 1) return this.send({ t: 'join', gameId: m.gameId });
      const prevFen = view.history[view.history.length - 1]?.fenAfter ?? view.fen;
      const entry = secretEntry({ uci: m.uci, san: m.san, fen: m.fen }, prevFen);
      this.game = new Game(m.fen);
      moveFeedback(m.san);
      return this.patchGame({
        clock: m.clock,
        clockOffset: m.serverNow - Date.now(),
        drawOfferBy: null,
        fen: m.fen,
        history: [...view.history, entry],
        reveals: [...view.reveals, ...(m.reveals ?? [])],
        lastReveals: m.reveals ?? [],
        firstMoveDeadline: m.ply === 1 ? (m.clock.startedAt ?? m.serverNow) + FIRST_MOVE_TIMEOUT_MS : null,
      });
    }
    const g = this.game;
    let mover: Color | null = null;
    if (g.ply === m.ply - 1) {
      const played = g.move(m.uci);
      mover = played?.color ?? null;
      if (played) moveFeedback(played.san);
    } else if (g.ply !== m.ply) {
      return this.send({ t: 'join', gameId: m.gameId });
    }
    this.patchGame({
      clock: m.clock,
      clockOffset: m.serverNow - Date.now(),
      drawOfferBy: null,
      fen: g.fen,
      history: g.history(),
      // White's first move starts black's 30 seconds; after black's, the clocks take over.
      firstMoveDeadline: m.ply === 1 ? (m.clock.startedAt ?? m.serverNow) + FIRST_MOVE_TIMEOUT_MS : null,
    });
    // Opponent just moved: play the next queued premove if it is legal now. An illegal one drops the whole queue.
    const [pm, ...rest] = this.state.game?.premoves ?? [];
    if (mover && mover !== view.you && pm) {
      const legal = g.legalMoves(pm.from as Square).find((x) => x.to === pm.to);
      this.patchGame({ premoves: legal ? rest : [] });
      if (legal) this.move(`${pm.from}${pm.to}${legal.promotion ? (pm.promotion ?? 'q') : ''}`);
    }
  }

  // ---- actions ----

  seek(req: SeekRequest) {
    this.dismissFinished();
    this.set({ seek: req, seekStatus: null, error: null });
    this.send({ t: 'seek', ...req });
  }

  cancelSeek() {
    this.set({ seek: null, seekStatus: null });
    this.send({ t: 'cancelSeek' });
  }

  createOpenGame(timeControl: TimeControl, rated: boolean, color: ColorChoice, range?: number) {
    this.dismissFinished();
    this.send({ t: 'createOpenGame', timeControl, rated, color, range });
  }

  cancelOpenGame() {
    this.set({ openGame: null });
    this.send({ t: 'cancelOpenGame' });
  }

  joinOpenGame(id: string) {
    this.dismissFinished();
    this.set({ error: null });
    this.send({ t: 'joinOpenGame', id });
  }

  lobbySub(): () => void {
    this.lobbySubs++;
    if (this.lobbySubs === 1) this.send({ t: 'lobbySub' });
    return () => {
      this.lobbySubs--;
      if (this.lobbySubs === 0) this.send({ t: 'lobbyUnsub' });
    };
  }

  /** Plays a move optimistically; the server confirms or resyncs. */
  move(uci: string): boolean {
    const view = this.state.game;
    const g = this.game;
    if (!view || view.outcome || g.turn !== view.you) return false;
    if (view.variant === 'secretQueen') {
      // No local rules check: only the server knows where the opponent's secret queen is.
      this.send({ t: 'move', gameId: view.gameId, uci, ply: view.history.length });
      return true;
    }
    const ply = g.ply;
    const played = g.move(uci);
    if (!played) return false;
    moveFeedback(played.san);
    this.patchGame({ fen: g.fen, history: g.history() });
    this.send({ t: 'move', gameId: view.gameId, uci, ply });
    return true;
  }

  /** Secret Queen: pick (or change) your secret pawn before your first move. */
  pickSecret(square: Square) {
    const view = this.state.game;
    if (!view || view.variant !== 'secretQueen' || !view.canPickSecret) return;
    this.patchGame({ secret: square });
    haptic('pickup');
    this.send({ t: 'secretPick', gameId: view.gameId, square });
  }

  /** Queues a premove: added to the end (`append`, web) or replacing what was queued (phones). */
  addPremove(premove: Premove, append: boolean) {
    playSound('premove');
    haptic('premove');
    this.patchGame({ premoves: append ? [...(this.state.game?.premoves ?? []), premove] : [premove] });
  }

  clearPremoves() {
    if (this.state.game?.premoves.length) this.patchGame({ premoves: [] });
  }

  private gameAction(t: 'resign' | 'abort' | 'offerDraw' | 'acceptDraw' | 'declineDraw' | 'rematch' | 'declineRematch') {
    const id = this.state.game?.gameId;
    if (id) this.send({ t, gameId: id });
  }

  resign = () => this.gameAction('resign');
  abort = () => this.gameAction('abort');
  offerDraw = () => this.gameAction('offerDraw');
  acceptDraw = () => this.gameAction('acceptDraw');
  declineDraw = () => this.gameAction('declineDraw');
  declineRematch = () => this.gameAction('declineRematch');
  rematch = () => {
    const g = this.state.game;
    if (g && !g.rematchBy) this.patchGame({ rematchBy: g.you, rematchDeclined: false });
    this.gameAction('rematch');
  };

  /** Clears a finished game from the store (back to the lobby). */
  dismissFinished() {
    if (this.state.game?.outcome) {
      this.game = new Game();
      this.set({ game: null });
    }
  }

  clearError() {
    this.set({ error: null });
  }

  // ---- challenges ----

  /** Direct challenge when `to` is a player id; open invite link otherwise. */
  createChallenge = (opts: { to?: string; timeControl: TimeControl; rated: boolean; color: ChallengeColor }) => {
    this.dismissFinished();
    this.send({ t: 'challengeCreate', ...opts });
  };
  getChallenge = (id: string) => this.send({ t: 'challengeGet', id });
  acceptChallenge = (id: string) => {
    this.dismissFinished();
    this.send({ t: 'challengeAccept', id });
  };
  declineChallenge = (id: string) => this.send({ t: 'challengeDecline', id });
  cancelChallenge = (id: string) => this.send({ t: 'challengeCancel', id });
}

export const playClient = new PlayClient();

export function usePlay(): PlayState {
  return useSyncExternalStore(playClient.subscribe, playClient.getState, playClient.getState);
}

/** Remaining time for a side, corrected for server clock offset. */
export function clockRemaining(clock: ClockState, color: Color, offset: number): number {
  return remaining(clock, color, Date.now() + offset);
}

export function isGuest(me: PlayerInfo | null): boolean {
  return !me || me.id.startsWith('g_');
}
