import type { TournamentChatMessage } from '@chessmate/core';
import { useCallback, useEffect, useState } from 'react';

import { playClient, usePlay } from '@/lib/playClient';
import { watchApi } from '@/lib/watchApi';

const MAX = 300;

/**
 * A Watch event's chat, live. Loads the latest messages over HTTP, then
 * follows the event on the game server's connection: new messages and
 * messages organisers hide arrive at once. Reloads after a reconnect, so
 * nothing sent while offline is missed. `send` posts a message; `hide` is for
 * organisers (they also get hidden messages, marked, from the server).
 */
export function useEventChat(eventId: string | undefined) {
  const [messages, setMessages] = useState<TournamentChatMessage[]>([]);
  const online = usePlay().connection === 'online';

  const reload = useCallback(() => {
    if (!eventId) return;
    watchApi.chat(eventId).then(setMessages, () => {});
  }, [eventId]);

  // (Re)load when the page opens and whenever the live connection comes back.
  useEffect(() => reload(), [online, reload]);

  useEffect(() => {
    if (!eventId) return;
    const stop = playClient.followEvent(eventId);
    const off = playClient.onServerMessage((m) => {
      if (m.t === 'eventChat' && m.eventId === eventId) {
        const msg = m.message;
        setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg].slice(-MAX)));
      } else if (m.t === 'eventChatHidden' && m.eventId === eventId) {
        // Organisers keep seeing a hidden message (dimmed): their own `hide` updates it in place.
        if (m.hidden) setMessages((prev) => prev.filter((x) => x.id !== m.messageId || x.hidden));
        else if (m.message) {
          const msg = m.message;
          setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev.map((x) => (x.id === msg.id ? msg : x)) : [...prev, msg].sort((a, b) => a.at - b.at)));
        }
      }
    });
    return () => {
      off();
      stop();
    };
  }, [eventId]);

  const send = useCallback(
    async (text: string) => {
      if (!eventId) return;
      const message = await watchApi.postChat(eventId, text);
      setMessages((prev) => (prev.some((x) => x.id === message.id) ? prev : [...prev, message]));
    },
    [eventId],
  );

  const hide = useCallback(async (messageId: string, hidden: boolean) => {
    const message = await watchApi.hideChat(messageId, hidden);
    setMessages((prev) => (prev.some((x) => x.id === message.id) ? prev.map((x) => (x.id === message.id ? message : x)) : [...prev, message].sort((a, b) => a.at - b.at)));
  }, []);

  return { messages, send, hide, reload };
}
