import {
  Game,
  PROTOCOL_VERSION,
  decodeServer,
  encode,
  remaining,
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
import { moveSound, playSound } from './sounds';
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
}

export interface SeekStatus {
  window: number | null;
  poolSize: number;
  waitedMs: number;
  /** Local time the status arrived, to keep the wait timer ticking between updates. */
  at: number;
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
  drawOfferBy: Color | null;
  opponentConnected: boolean;
  /** Server time at which the absent opponent forfeits. */
  opponentAbandonAt: number | null;
  rematchBy: Color | null;
  rematchDeclined: boolean;
  premove: { from: string; to: string } | null;
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
        this.set({ connection: 'online', me: m.player, error: null });
        return this.restore();
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
        if (!same) playSound('start');
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
        playSound('end');
        return this.patchGame({
          outcome: m.outcome,
          ratingChange: m.ratingChange,
          drawOfferBy: null,
          premove: null,
          opponentAbandonAt: null,
          clock: { ...this.state.game.clock, running: null, startedAt: null },
        });
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
    this.game = Game.fromUciMoves(s.moves, s.initialFen);
    const prev = this.state.game?.gameId === s.gameId ? this.state.game : null;
    this.set({
      game: {
        gameId: s.gameId,
        you,
        white: s.white,
        black: s.black,
        timeControl: s.timeControl,
        rated: s.rated,
        fen: this.game.fen,
        history: this.game.history(),
        clock: s.clock,
        clockOffset: s.serverNow - Date.now(),
        outcome: s.outcome,
        drawOfferBy: s.drawOfferBy,
        opponentConnected: prev?.opponentConnected ?? true,
        opponentAbandonAt: prev?.opponentAbandonAt ?? null,
        ratingChange: prev?.ratingChange,
        rematchBy: null,
        rematchDeclined: false,
        premove: prev?.premove ?? null,
      },
      error: null,
    });
  }

  private onMoved(m: Extract<ServerMessage, { t: 'moved' }>) {
    const view = this.state.game;
    if (!view || view.gameId !== m.gameId) return;
    const g = this.game;
    let mover: Color | null = null;
    if (g.ply === m.ply - 1) {
      const played = g.move(m.uci);
      mover = played?.color ?? null;
      if (played) playSound(moveSound(played.san));
    } else if (g.ply !== m.ply) {
      return this.send({ t: 'join', gameId: m.gameId });
    }
    this.patchGame({
      clock: m.clock,
      clockOffset: m.serverNow - Date.now(),
      drawOfferBy: null,
      fen: g.fen,
      history: g.history(),
    });
    // Opponent just moved: fire the queued premove if it is legal now.
    const pm = this.state.game?.premove;
    if (mover && mover !== view.you && pm) {
      this.patchGame({ premove: null });
      const legal = g.legalMoves(pm.from as Square).find((x) => x.to === pm.to);
      if (legal) this.move(`${pm.from}${pm.to}${legal.promotion ? 'q' : ''}`);
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
    const ply = g.ply;
    const played = g.move(uci);
    if (!played) return false;
    playSound(moveSound(played.san));
    this.patchGame({ fen: g.fen, history: g.history() });
    this.send({ t: 'move', gameId: view.gameId, uci, ply });
    return true;
  }

  setPremove(premove: GameView['premove']) {
    if (premove) playSound('premove');
    this.patchGame({ premove });
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
