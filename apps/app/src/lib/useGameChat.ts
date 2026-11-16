import { CHAT_MAX_LENGTH, type ChatLine, type ClientMessage, type QuickMessageId, type ReportReason, type ServerMessage } from '@chessmate/core';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

// ---- mute list (per device) ----
// Muting is a viewer preference: the muted player's messages are hidden on
// this device. Saved in localStorage on web; in memory on native until a
// shared settings store lands.

const MUTE_KEY = 'chessmate.mutedPlayers';
const CHAT_OFF_KEY = 'chessmate.chatOff';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: keep the in-memory value
  }
}

let muted = new Set<string>(load<string[]>(MUTE_KEY, []));
let chatOff = load<boolean>(CHAT_OFF_KEY, false);
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribePrefs = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
let snapshot = { muted, chatOff };
const getPrefs = () => snapshot;

export function setMuted(playerId: string, on: boolean) {
  muted = new Set(muted);
  if (on) muted.add(playerId);
  else muted.delete(playerId);
  save(MUTE_KEY, [...muted]);
  snapshot = { muted, chatOff };
  emit();
}

export function setChatOff(on: boolean) {
  chatOff = on;
  save(CHAT_OFF_KEY, on);
  snapshot = { muted, chatOff };
  emit();
}

export function useChatPrefs() {
  return useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);
}

// ---- chat for one game ----

type Send = (m: ClientMessage) => void;
type Subscribe = (fn: (m: ServerMessage) => void) => () => void;

export interface GameChat {
  lines: ChatLine[];
  /** Lines from muted players are counted but not shown. */
  hiddenCount: number;
  notice: string | null;
  sendText: (text: string) => boolean;
  sendQuick: (id: QuickMessageId) => void;
  report: (playerId: string, reason: ReportReason, note: string) => Promise<boolean>;
}

export function useGameChat(gameId: string | null, myId: string | null, send: Send, subscribe: Subscribe): GameChat {
  const [all, setAll] = useState<ChatLine[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const prefs = useChatPrefs();

  useEffect(() => {
    setAll([]);
    setNotice(null);
  }, [gameId]);

  useEffect(
    () =>
      subscribe((m) => {
        if (m.t === 'chat' && m.line.gameId === gameId) setAll((p) => (p.some((l) => l.id === m.line.id) ? p : [...p, m.line]));
        else if (m.t === 'chatHistory' && m.gameId === gameId) setAll(m.lines);
        else if (m.t === 'error' && (m.code === 'chat_restricted' || m.code === 'rate_limited')) setNotice(m.message);
      }),
    [subscribe, gameId],
  );

  const visible = all.filter((l) => l.playerId === myId || !prefs.muted.has(l.playerId));
  const lines = prefs.chatOff ? visible.filter((l) => l.playerId === myId) : visible;

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim().slice(0, CHAT_MAX_LENGTH);
      if (!gameId || !trimmed) return false;
      setNotice(null);
      send({ t: 'chat', gameId, text: trimmed });
      return true;
    },
    [gameId, send],
  );

  const sendQuick = useCallback(
    (quick: QuickMessageId) => {
      if (!gameId) return;
      setNotice(null);
      send({ t: 'chat', gameId, quick });
    },
    [gameId, send],
  );

  const report = useCallback(
    (playerId: string, reason: ReportReason, note: string) =>
      new Promise<boolean>((resolve) => {
        const done = (ok: boolean) => {
          clearTimeout(timer);
          unsub();
          resolve(ok);
        };
        const unsub = subscribe((m) => {
          if (m.t === 'reported') done(true);
          else if (m.t === 'error') done(false);
        });
        const timer = setTimeout(() => done(false), 8000);
        send({ t: 'report', playerId, gameId: gameId ?? undefined, reason, note: note.trim() || undefined });
      }),
    [gameId, send, subscribe],
  );

  return {
    lines,
    hiddenCount: all.length - lines.length,
    notice,
    sendText,
    sendQuick,
    report,
  };
}
