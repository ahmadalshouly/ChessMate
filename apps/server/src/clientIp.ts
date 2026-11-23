/**
 * The address of the player behind a request, for rate limits.
 *
 * Behind a proxy (Fly.io, a load balancer) every request arrives from the
 * proxy's own address, so keying limits on the socket would put every player
 * in one bucket. TRUST_PROXY says which proxy sits in front:
 *
 * - unset: no proxy, use the socket address (local, Docker Compose).
 * - `fly`: Fly.io. Its proxy sets `Fly-Client-IP` and overwrites any value a
 *   client sends.
 * - `1` (or `true`): one generic proxy that appends the client to
 *   `X-Forwarded-For`. The last entry is the one that proxy added; earlier
 *   entries come from the client and could be faked, so they are ignored.
 */
type Req = { socket: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> };

const header = (req: Req, name: string): string | undefined => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[v.length - 1] : v)?.trim() || undefined;
};

export function clientIp(req: Req, trustProxy = process.env.TRUST_PROXY): string {
  const mode = trustProxy?.trim().toLowerCase();
  let ip: string | undefined;
  if (mode === 'fly') ip = header(req, 'fly-client-ip');
  else if (mode === '1' || mode === 'true') ip = header(req, 'x-forwarded-for')?.split(',').pop()?.trim() || undefined;
  return ip || req.socket.remoteAddress || 'unknown';
}
