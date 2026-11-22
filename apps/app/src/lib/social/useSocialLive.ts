import { PROTOCOL_VERSION, decodeServer, encode, type Presence, type SocialEvent } from '@chessmate/core';
import { useEffect, useRef } from 'react';

import { SERVER_URL } from '@/lib/config';
import { freshSocialToken, useSocialIdentity } from './session';

/**
 * Keeps a socket open while social screens are visible, so the user shows as
 * online and receives friends' presence changes and friend-request events.
 */
export function useSocialLive(handlers: { onPresence?: (userId: string, p: Presence) => void; onEvent?: (e: SocialEvent) => void }) {
  const id = useSocialIdentity();
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!id) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const connect = () => {
      ws = new WebSocket(SERVER_URL);
      ws.onopen = () => {
        attempt = 0;
        const sock = ws;
        void freshSocialToken().then((token) => {
          if (sock && sock.readyState === WebSocket.OPEN) sock.send(encode({ t: 'hello', v: PROTOCOL_VERSION, token: token ?? id.token }));
        });
      };
      ws.onmessage = (ev) => {
        const m = decodeServer(String(ev.data));
        if (m?.t === 'presence') ref.current.onPresence?.(m.userId, m.presence);
        else if (m?.t === 'social') ref.current.onEvent?.(m.event);
      };
      ws.onclose = () => {
        if (closed) return;
        timer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempt++));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [id]);
}
