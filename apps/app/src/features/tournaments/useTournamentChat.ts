import type { TournamentChatMessage } from '@chessmate/core';
import { useCallback, useEffect, useState } from 'react';

import { playClient, usePlay } from '@/lib/playClient';
import { tournamentsApi } from '@/lib/tournamentsApi';

const MAX = 300;

/**
 * A tournament's chat, live. Loads the latest messages over HTTP, then
 * follows the tournament on the game server's connection: new messages and
 * messages staff hide arrive at once. Reloads after a reconnect, so nothing
 * sent while offline is missed. `send` posts a message.
 */
export function useTournamentChat(tournamentId: string | undefined) {
  const [messages, setMessages] = useState<TournamentChatMessage[]>([]);
  const online = usePlay().connection === 'online';

  const reload = useCallback(() => {
    if (!tournamentId) return;
    tournamentsApi.chat(tournamentId).then(
      (r) => setMessages(r.messages),
      () => {},
    );
  }, [tournamentId]);

  // (Re)load when the page opens and whenever the live connection comes back.
  useEffect(() => reload(), [online, reload]);

  useEffect(() => {
    if (!tournamentId) return;
    const stop = playClient.followTournament(tournamentId);
    const off = playClient.onServerMessage((m) => {
      if (m.t === 'tournamentChat' && m.tournamentId === tournamentId) {
        const msg = m.message;
        setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg].slice(-MAX)));
      } else if (m.t === 'tournamentChatHidden' && m.tournamentId === tournamentId) {
        if (m.hidden) setMessages((prev) => prev.filter((x) => x.id !== m.messageId));
        else if (m.message) {
          const msg = m.message;
          setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg].sort((a, b) => a.at - b.at)));
        }
      }
    });
    return () => {
      off();
      stop();
    };
  }, [tournamentId]);

  const send = useCallback(
    async (text: string) => {
      if (!tournamentId) return;
      const { message } = await tournamentsApi.postChat(tournamentId, text);
      setMessages((prev) => (prev.some((x) => x.id === message.id) ? prev : [...prev, message]));
    },
    [tournamentId],
  );

  return { messages, send };
}
