import type { IncomingMessage, ServerResponse } from 'node:http';
import { RateLimiter } from './rateLimit';
import { AuthError, type AccessIdentity, type AuthService } from './service';

/** An HTTP handler the game server tries before its 404. Return true when handled. */
export type HttpRoute = (req: IncomingMessage, res: ServerResponse, url: URL) => boolean | Promise<boolean>;

const STATUS: Record<AuthError['code'], number> = {
  invalid_input: 400,
  weak_password: 400,
  invalid_credentials: 401,
  invalid_token: 401,
  unauthorized: 401,
  username_taken: 409,
  email_taken: 409,
  not_found: 404,
  rate_limited: 429,
};

const MAX_BODY = 16 * 1024;

export interface AuthRoutesOptions {
  /** Allowed browser origins. Default: any origin outside production, none in production unless listed. */
  corsOrigins?: string[];
  /** Turn rate limiting off (tests). */
  rateLimit?: boolean;
  now?: () => number;
}

/** Reads `Authorization: Bearer <accessToken>` and verifies it. */
export function bearerUser(req: IncomingMessage, auth: AuthService): AccessIdentity | null {
  const h = req.headers.authorization;
  const m = h ? /^Bearer\s+(\S+)$/i.exec(h) : null;
  return m ? auth.verifyAccessToken(m[1]!) : null;
}

export function sendJson(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function sendError(res: ServerResponse, e: AuthError) {
  sendJson(res, STATUS[e.code], { error: { code: e.code, message: e.message, ...(e.field ? { field: e.field } : {}) } });
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const type = req.headers['content-type'] ?? '';
  if (!/^application\/json\b/i.test(type)) throw new AuthError('invalid_input', 'Expected a JSON body');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new AuthError('invalid_input', 'Request body too large');
    chunks.push(chunk as Buffer);
  }
  try {
    const v: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new AuthError('invalid_input', 'Malformed JSON');
  }
}

/** Applies CORS headers. Returns true when the request was a preflight and has been answered. */
export function applyCors(req: IncomingMessage, res: ServerResponse, allowed?: string[]): boolean {
  const origin = req.headers.origin;
  if (origin) {
    const ok = allowed ? allowed.includes(origin) : process.env.NODE_ENV !== 'production';
    if (ok) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-headers', 'Authorization, Content-Type');
      res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('access-control-max-age', '600');
    }
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return true;
  }
  return false;
}

function clientIp(req: IncomingMessage): string {
  // Only trust X-Forwarded-For when explicitly running behind a proxy.
  const fwd = process.env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() : '';
  return fwd || req.socket.remoteAddress || 'unknown';
}

/**
 * HTTP API under /api/auth: signup, login, refresh, logout, me,
 * forgot-password, reset-password and change-password.
 */
export function authRoutes(auth: AuthService, opts: AuthRoutesOptions = {}): HttpRoute {
  const now = opts.now ?? Date.now;
  const limits = {
    login: new RateLimiter(10, 15 * 60_000),
    signup: new RateLimiter(20, 60 * 60_000),
    forgot: new RateLimiter(5, 60 * 60_000),
    other: new RateLimiter(60, 60_000),
  };
  const corsOrigins = opts.corsOrigins ?? (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()) : undefined);
  const limit = (bucket: keyof typeof limits, key: string) => {
    if (opts.rateLimit === false) return;
    if (!limits[bucket].take(key, now())) throw new AuthError('rate_limited', 'Too many attempts, try again later');
  };

  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/auth/')) return false;
    if (applyCors(req, res, corsOrigins)) return true;
    const route = `${req.method} ${url.pathname.slice('/api/auth'.length)}`;
    const ip = clientIp(req);
    try {
      switch (route) {
        case 'POST /signup': {
          limit('signup', ip);
          sendJson(res, 201, await auth.signup(await readJson(req)));
          return true;
        }
        case 'POST /login': {
          const body = await readJson(req);
          limit('login', `${ip}:${String(body.login ?? '').toLowerCase()}`);
          sendJson(res, 200, await auth.login(body));
          return true;
        }
        case 'POST /refresh': {
          limit('other', ip);
          const body = await readJson(req);
          sendJson(res, 200, await auth.refresh(body.refreshToken));
          return true;
        }
        case 'POST /logout': {
          const body = await readJson(req);
          await auth.logout(body.refreshToken, body.all === true);
          sendJson(res, 204);
          return true;
        }
        case 'GET /me': {
          const who = bearerUser(req, auth);
          const user = who && (await auth.getUser(who.userId));
          if (!user) throw new AuthError('unauthorized', 'Sign in again');
          sendJson(res, 200, { user });
          return true;
        }
        case 'POST /forgot-password': {
          limit('forgot', ip);
          const body = await readJson(req);
          await auth.forgotPassword(body.email);
          sendJson(res, 202, { ok: true });
          return true;
        }
        case 'POST /reset-password': {
          limit('other', ip);
          await auth.resetPassword(await readJson(req));
          sendJson(res, 204);
          return true;
        }
        case 'POST /change-password': {
          const who = bearerUser(req, auth);
          if (!who) throw new AuthError('unauthorized', 'Sign in again');
          limit('login', `${ip}:${who.userId}`);
          const body = await readJson(req);
          await auth.changePassword(who.userId, body.currentPassword, body.newPassword);
          sendJson(res, 204);
          return true;
        }
        default:
          sendJson(res, 404, { error: { code: 'not_found', message: 'No such endpoint' } });
          return true;
      }
    } catch (e) {
      if (e instanceof AuthError) sendError(res, e);
      else {
        console.error('[auth]', e);
        sendJson(res, 500, { error: { code: 'server_error', message: 'Something went wrong' } });
      }
      return true;
    }
  };
}
