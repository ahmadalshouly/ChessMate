import type { ConversationSummary, MessageView, SocialUser } from '@chessmate/core';
import { useEffect, useSyncExternalStore } from 'react';

import { playClient } from './playClient';
import { apiRequest } from './social/api';
import { useSocialIdentity } from './social/session';

export interface Thread {
  user: SocialUser | null;
  messages: MessageView[];
  canSend: boolean;
  reason: string | null;
}

export const messagesApi = {
  conversations: () => apiRequest<{ conversations: ConversationSummary[]; unread: number }>('GET', '/api/messages'),
  thread: (key: string, before?: number) => apiRequest<Thread>('GET', `/api/messages/${encodeURIComponent(key)}${before ? `?before=${before}` : ''}`),
  send: (userId: string, body: string) => apiRequest<{ message: MessageView }>('POST', `/api/messages/${encodeURIComponent(userId)}`, { body }),
  markRead: (key: string) => apiRequest<{ unread: number }>('POST', `/api/messages/${encodeURIComponent(key)}/read`),
  can: (userId: string) => apiRequest<{ ok: boolean; reason?: string }>('GET', `/api/messages/${encodeURIComponent(userId)}/can`),
  unread: () => apiRequest<{ unread: number }>('GET', '/api/messages/unread'),
};

// ---- unread count, shared by the header button and the Social tab

let unread = 0;
const listeners = new Set<() => void>();
export function setUnreadMessages(n: number) {
  if (n === unread) return;
  unread = n;
  for (const l of listeners) l();
}

/** New messages arrive on the game socket as social events; anything listening can refresh. */
const messageListeners = new Set<(m: MessageView) => void>();
export function onDirectMessage(fn: (m: MessageView) => void): () => void {
  messageListeners.add(fn);
  return () => messageListeners.delete(fn);
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  playClient.onServerMessage((m) => {
    if (m.t !== 'social' || m.event.kind !== 'message') return;
    setUnreadMessages(m.event.unread);
    for (const fn of messageListeners) fn(m.event.message);
  });
}

/** Unread direct messages for the signed-in player, kept live. */
export function useUnreadMessages(): number {
  const me = useSocialIdentity();
  useEffect(() => {
    wire();
    if (!me) return setUnreadMessages(0);
    messagesApi.unread().then((r) => setUnreadMessages(r.unread), () => {});
  }, [me]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => unread,
    () => unread,
  );
}
