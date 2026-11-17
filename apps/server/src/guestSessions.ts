import { randomBytes } from 'node:crypto';

const PREFIX = 'guest-resume:';

/**
 * Lets a guest reconnect as the same player (to resume a game after a dropped
 * connection or a page reload). The server hands out an unguessable token at
 * welcome; signed-in players use their session token instead.
 */
export class GuestSessions {
  private secrets = new Map<string, string>();

  issue(playerId: string): string {
    const existing = this.secrets.get(playerId);
    const secret = existing ?? randomBytes(18).toString('base64url');
    this.secrets.set(playerId, secret);
    return `${PREFIX}${playerId}:${secret}`;
  }

  /** Returns the player id for a valid resume token, null otherwise (or undefined if the token is not a resume token). */
  resolve(token: string): string | null | undefined {
    if (!token.startsWith(PREFIX)) return undefined;
    const rest = token.slice(PREFIX.length);
    const i = rest.lastIndexOf(':');
    if (i <= 0) return null;
    const id = rest.slice(0, i);
    return this.secrets.get(id) === rest.slice(i + 1) ? id : null;
  }
}
