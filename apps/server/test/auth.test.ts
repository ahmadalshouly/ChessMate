import { decodeServer, encode } from '@chessmate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  AuthError,
  AuthService,
  MemoryAuthStore,
  REFRESH_TTL_MS,
  authRoutes,
  hashPassword,
  signJwt,
  verifyJwt,
  verifyPassword,
  type Mailer,
} from '../src/auth';
import { ChessServer } from '../src/server';

const SECRET = 'test-secret-test-secret-test-secret!';

class CaptureMailer implements Mailer {
  last: { email: string; token: string } | null = null;
  async sendPasswordReset(to: { email: string }, token: string) {
    this.last = { email: to.email, token };
  }
}

function setup() {
  let t = Date.UTC(2026, 0, 1);
  const mailer = new CaptureMailer();
  const auth = new AuthService({ store: new MemoryAuthStore(), mailer, secret: SECRET, now: () => t });
  return { auth, mailer, advance: (ms: number) => (t += ms) };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof AuthError ? e.code : String(e);
  }
};

describe('passwords and jwt', () => {
  it('hashes with a salt and verifies', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('wrong horse', a)).toBe(false);
  });

  it('rejects tampered, expired and alg=none tokens', () => {
    const tok = signJwt({ sub: 'u1', iat: 0, exp: 100 }, SECRET);
    expect(verifyJwt(tok, SECRET, 50)?.sub).toBe('u1');
    expect(verifyJwt(tok, SECRET, 100)).toBeNull();
    expect(verifyJwt(tok, 'another-secret-another-secret-xx', 50)).toBeNull();
    const [, p, s] = tok.split('.');
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verifyJwt(`${none}.${p}.${s}`, SECRET, 50)).toBeNull();
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', iat: 0, exp: 100 })).toString('base64url');
    expect(verifyJwt(`${tok.split('.')[0]}.${forged}.${s}`, SECRET, 50)).toBeNull();
  });
});

describe('AuthService', () => {
  it('signs up, logs in by username or email, and validates input', async () => {
    const { auth } = setup();
    const r = await auth.signup({ username: 'Magnus_C', email: 'Magnus@Example.com', password: 'kingside castle' });
    expect(r.user).toMatchObject({ username: 'Magnus_C', email: 'magnus@example.com' });
    expect(r.user).not.toHaveProperty('passwordHash');
    expect(auth.verifyAccessToken(r.tokens.accessToken)).toEqual({ userId: r.user.id, username: 'Magnus_C' });

    expect((await auth.login({ login: 'magnus_c', password: 'kingside castle' })).user.id).toBe(r.user.id);
    expect((await auth.login({ login: 'MAGNUS@example.com', password: 'kingside castle' })).user.id).toBe(r.user.id);
    expect(await code(auth.login({ login: 'magnus_c', password: 'nope nope' }))).toBe('invalid_credentials');
    expect(await code(auth.login({ login: 'nobody', password: 'kingside castle' }))).toBe('invalid_credentials');

    expect(await code(auth.signup({ username: 'magnus_c', email: 'x@example.com', password: 'kingside castle' }))).toBe('username_taken');
    expect(await code(auth.signup({ username: 'other', email: 'MAGNUS@example.com', password: 'kingside castle' }))).toBe('email_taken');
    expect(await code(auth.signup({ username: 'ab', email: 'a@example.com', password: 'kingside castle' }))).toBe('invalid_input');
    expect(await code(auth.signup({ username: 'admin', email: 'a@example.com', password: 'kingside castle' }))).toBe('username_taken');
    expect(await code(auth.signup({ username: 'abc', email: 'not-an-email', password: 'kingside castle' }))).toBe('invalid_input');
    expect(await code(auth.signup({ username: 'abc', email: 'a@example.com', password: 'short' }))).toBe('weak_password');
    expect(await code(auth.signup({ username: 'abc', email: 'a@example.com', password: 'password' }))).toBe('weak_password');
  });

  it('expires access tokens after 15 minutes', async () => {
    const { auth, advance } = setup();
    const r = await auth.signup({ username: 'tal', email: 'tal@example.com', password: 'sacrifice!' });
    advance(14 * 60_000);
    expect(auth.verifyAccessToken(r.tokens.accessToken)).not.toBeNull();
    advance(2 * 60_000);
    expect(auth.verifyAccessToken(r.tokens.accessToken)).toBeNull();
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const { auth } = setup();
    const r0 = await auth.signup({ username: 'polgar', email: 'judit@example.com', password: 'attack attack' });
    const r1 = await auth.refresh(r0.tokens.refreshToken);
    expect(r1.tokens.refreshToken).not.toBe(r0.tokens.refreshToken);
    // Replaying the old token is treated as theft: both it and the new one die.
    expect(await code(auth.refresh(r0.tokens.refreshToken))).toBe('invalid_token');
    expect(await code(auth.refresh(r1.tokens.refreshToken))).toBe('invalid_token');
    // Other logins are unaffected.
    const other = await auth.login({ login: 'polgar', password: 'attack attack' });
    expect(await code(auth.refresh(other.tokens.refreshToken))).toBe('ok');
  });

  it('expires refresh tokens and logs out one or all sessions', async () => {
    const { auth, advance } = setup();
    const a = await auth.signup({ username: 'karpov', email: 'k@example.com', password: 'positional' });
    const b = await auth.login({ login: 'karpov', password: 'positional' });
    const c = await auth.login({ login: 'karpov', password: 'positional' });
    await auth.logout(a.tokens.refreshToken);
    expect(await code(auth.refresh(a.tokens.refreshToken))).toBe('invalid_token');
    expect(await code(auth.refresh(b.tokens.refreshToken))).toBe('ok');
    await auth.logout(c.tokens.refreshToken, true);
    expect(await code(auth.refresh(c.tokens.refreshToken))).toBe('invalid_token');
    const d = await auth.login({ login: 'karpov', password: 'positional' });
    advance(REFRESH_TTL_MS + 1);
    expect(await code(auth.refresh(d.tokens.refreshToken))).toBe('invalid_token');
    expect(await code(auth.refresh('garbage'))).toBe('invalid_token');
  });

  it('resets a password once, signs out everywhere, and hides unknown emails', async () => {
    const { auth, mailer, advance } = setup();
    const s = await auth.signup({ username: 'fischer', email: 'bobby@example.com', password: 'sicilian najdorf' });
    await auth.forgotPassword('nobody@example.com');
    expect(mailer.last).toBeNull();
    await auth.forgotPassword('BOBBY@example.com');
    const token = mailer.last!.token;
    expect(await code(auth.resetPassword({ token, password: 'short' }))).toBe('weak_password');
    await auth.resetPassword({ token, password: 'kings indian' });
    expect(await code(auth.resetPassword({ token, password: 'another one' }))).toBe('invalid_token');
    expect(await code(auth.refresh(s.tokens.refreshToken))).toBe('invalid_token');
    expect(await code(auth.login({ login: 'fischer', password: 'sicilian najdorf' }))).toBe('invalid_credentials');
    expect(await code(auth.login({ login: 'fischer', password: 'kings indian' }))).toBe('ok');

    await auth.forgotPassword('bobby@example.com');
    advance(31 * 60_000);
    expect(await code(auth.resetPassword({ token: mailer.last!.token, password: 'too late now' }))).toBe('invalid_token');
  });

  it('changes password and deletes accounts after re-checking the password', async () => {
    const { auth } = setup();
    const s = await auth.signup({ username: 'carlsen', email: 'mc@example.com', password: 'endgame grind' });
    expect(await code(auth.changePassword(s.user.id, 'wrong', 'new password!'))).toBe('invalid_credentials');
    await auth.changePassword(s.user.id, 'endgame grind', 'new password!');
    expect(await code(auth.refresh(s.tokens.refreshToken))).toBe('invalid_token');
    expect(await auth.checkPassword(s.user.id, 'new password!')).toBe(true);
    expect(await code(auth.deleteAccount(s.user.id, 'endgame grind'))).toBe('invalid_credentials');
    await auth.deleteAccount(s.user.id, 'new password!');
    expect(await auth.getUser(s.user.id)).toBeNull();
    expect(await code(auth.signup({ username: 'carlsen', email: 'mc@example.com', password: 'fresh start' }))).toBe('ok');
  });
});

describe('HTTP API and WebSocket auth', () => {
  let server: ChessServer;
  let base: string;
  let mailer: CaptureMailer;

  beforeAll(async () => {
    mailer = new CaptureMailer();
    const auth = new AuthService({ store: new MemoryAuthStore(), mailer, secret: SECRET });
    server = new ChessServer({ port: 0, matchIntervalMs: 20, auth, http: [authRoutes(auth, { rateLimit: false })] });
    base = `http://localhost:${await server.listen()}`;
  });
  afterAll(() => server.close());

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

  it('runs the signup, me, refresh, logout and reset flow over HTTP', async () => {
    const res = await post('/signup', { username: 'hikaru', email: 'h@example.com', password: 'bullet brain' });
    expect(res.status).toBe(201);
    const { user, tokens } = (await res.json()) as { user: { id: string }; tokens: { accessToken: string; refreshToken: string; accessExpiresAt: number } };
    expect(typeof tokens.accessExpiresAt).toBe('number');

    const me = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { id: string } }).user.id).toBe(user.id);
    expect((await fetch(`${base}/api/auth/me`)).status).toBe(401);

    const dup = await post('/signup', { username: 'HIKARU', email: 'z@example.com', password: 'bullet brain' });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ error: { code: 'username_taken', message: 'That username is taken', field: 'username' } });

    const bad = await post('/login', { login: 'hikaru', password: 'wrong pass' });
    expect(bad.status).toBe(401);

    const refreshed = await post('/refresh', { refreshToken: tokens.refreshToken });
    expect(refreshed.status).toBe(200);
    const r2 = ((await refreshed.json()) as { tokens: { refreshToken: string } }).tokens.refreshToken;
    expect((await post('/logout', { refreshToken: r2 })).status).toBe(204);
    expect((await post('/refresh', { refreshToken: r2 })).status).toBe(401);

    expect((await post('/forgot-password', { email: 'nobody@example.com' })).status).toBe(202);
    expect((await post('/forgot-password', { email: 'h@example.com' })).status).toBe(202);
    expect((await post('/reset-password', { token: mailer.last!.token, password: 'new and long' })).status).toBe(204);
    expect((await post('/login', { login: 'h@example.com', password: 'new and long' })).status).toBe(200);
  });

  it('answers CORS preflight and rejects non-JSON bodies', async () => {
    const pre = await fetch(`${base}/api/auth/login`, { method: 'OPTIONS', headers: { origin: 'http://localhost:8081' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    expect(pre.headers.get('access-control-allow-headers')).toContain('Authorization');
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', body: 'login=x' });
    expect(res.status).toBe(400);
  });

  function hello(token: string) {
    return new Promise<{ welcome?: { id: string; name: string }; closeCode?: number }>((resolve) => {
      const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`);
      ws.on('open', () => ws.send(encode({ t: 'hello', v: 1, token })));
      ws.on('message', (d) => {
        const m = decodeServer(String(d));
        if (m?.t === 'welcome') {
          resolve({ welcome: m.player });
          ws.close();
        }
      });
      ws.on('close', (c) => resolve({ closeCode: c }));
    });
  }

  it('accepts account access tokens and guests on the WebSocket, rejects bad tokens', async () => {
    const res = await post('/signup', { username: 'anand', email: 'vishy@example.com', password: 'tiger of madras' });
    const { user, tokens } = (await res.json()) as { user: { id: string }; tokens: { accessToken: string } };
    expect((await hello(tokens.accessToken)).welcome).toMatchObject({ id: user.id, name: 'anand' });
    const guest = (await hello('guest:Visitor')).welcome!;
    expect(guest.id.startsWith('g_')).toBe(true);
    expect(guest.name).toBe('Visitor');
    expect((await hello(`${tokens.accessToken}x`)).closeCode).toBe(4003);
    expect((await hello('nonsense')).closeCode).toBe(4003);
  });
});
