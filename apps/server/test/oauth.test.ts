import { openDb, type DbHandle } from '@chessmate/db';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AuthError,
  AuthService,
  DbAuthStore,
  MemoryAuthStore,
  OAuthVerifier,
  authRoutes,
  oauthConfigFromEnv,
  staticKeys,
  usernameFrom,
  verifyIdToken,
  type AuthStore,
  type Mailer,
} from '../src/auth';

const SECRET = 'test-secret-test-secret-test-secret!';
const NOW = Date.UTC(2026, 10, 17);
const nowSec = Math.floor(NOW / 1000);
const GOOGLE_ID = 'web-client.apps.googleusercontent.com';

const mailer: Mailer = { async sendPasswordReset() {} };

function keyPair(kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } };
}

const google = keyPair('g1');
const apple = keyPair('a1');
const stranger = keyPair('g1'); // same kid, different key

function mint(key: { kid: string; privateKey: KeyObject }, claims: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${enc({ alg: 'RS256', kid: key.kid, typ: 'JWT' })}.${enc(claims)}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), key.privateKey).toString('base64url')}`;
}

const googleToken = (over: Record<string, unknown> = {}) =>
  mint(google, { iss: 'https://accounts.google.com', aud: GOOGLE_ID, sub: 'g-123', email: 'Ahmad@Example.com', email_verified: true, name: 'Ahmad Shouly', iat: nowSec - 10, exp: nowSec + 3600, ...over });
const appleToken = (over: Record<string, unknown> = {}) =>
  mint(apple, { iss: 'https://appleid.apple.com', aud: 'com.chessmate.app', sub: 'a-456', email: 'relay@privaterelay.appleid.com', email_verified: 'true', iat: nowSec - 10, exp: nowSec + 600, ...over });

function verifier() {
  return new OAuthVerifier({
    googleClientIds: [GOOGLE_ID],
    appleClientIds: ['com.chessmate.app', 'host.exp.Exponent'],
    googleKeys: staticKeys({ keys: [google.jwk] }),
    appleKeys: staticKeys({ keys: [apple.jwk] }),
    now: () => NOW,
  });
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof AuthError ? e.code : String(e);
  }
};

describe('ID token verification', () => {
  const opts = { keys: staticKeys({ keys: [google.jwk] }), issuers: ['https://accounts.google.com'], audiences: [GOOGLE_ID], now: nowSec };

  it('accepts a valid token and returns its claims', async () => {
    const c = await verifyIdToken(googleToken(), opts);
    expect(c.sub).toBe('g-123');
  });

  it('rejects forged, foreign, expired and malformed tokens', async () => {
    await expect(verifyIdToken(mint(stranger, { iss: 'https://accounts.google.com', aud: GOOGLE_ID, sub: 'x', exp: nowSec + 60 }), opts)).rejects.toThrow('Bad signature');
    await expect(verifyIdToken(googleToken({ aud: 'someone-else' }), opts)).rejects.toThrow('another app');
    await expect(verifyIdToken(googleToken({ iss: 'https://evil.example' }), opts)).rejects.toThrow('issuer');
    await expect(verifyIdToken(googleToken({ exp: nowSec - 3600 }), opts)).rejects.toThrow('expired');
    await expect(verifyIdToken('not.a.jwt', opts)).rejects.toThrow();
    const [h, p] = googleToken().split('.');
    await expect(verifyIdToken(`${h}.${p}.`, opts)).rejects.toThrow();
  });
});

describe('oauth config', () => {
  it('reads client ids and accepts Expo Go for Apple outside production', () => {
    expect(oauthConfigFromEnv({ GOOGLE_CLIENT_IDS: 'a, b' })).toMatchObject({ googleClientIds: ['a', 'b'], appleClientIds: ['com.chessmate.app', 'host.exp.Exponent'] });
    expect(oauthConfigFromEnv({ NODE_ENV: 'production' }).appleClientIds).toEqual(['com.chessmate.app']);
    expect(oauthConfigFromEnv({ APPLE_CLIENT_IDS: '' }).appleClientIds).toEqual([]);
  });

  it('makes usable usernames', () => {
    expect(usernameFrom('Ahmad Shouly')).toBe('Ahmad_Shouly');
    expect(usernameFrom('José')).toBe('Jose');
    expect(usernameFrom('李')).toBe('player');
    expect(usernameFrom('admin')).toBe('player_admin');
    expect(usernameFrom('a.very.long.name.indeed.yes', 3)).toMatch(/^[A-Za-z0-9_]{3,20}$/);
  });
});

function oauthSuite(name: string, makeStore: () => Promise<{ store: AuthStore; close?: () => Promise<void> }>) {
  describe(name, () => {
    let auth: AuthService;
    let close: (() => Promise<void>) | undefined;

    beforeAll(async () => {
      const s = await makeStore();
      close = s.close;
      auth = new AuthService({ store: s.store, mailer, secret: SECRET, oauth: verifier(), now: () => NOW });
    }, 60_000);
    afterAll(async () => close?.());

    it('creates an account on first Google sign-in and finds it again', async () => {
      const first = await auth.oauthSignIn('google', { idToken: googleToken() });
      expect(first.created).toBe(true);
      expect(first.user).toMatchObject({ username: 'Ahmad_Shouly', email: 'ahmad@example.com', hasPassword: false });
      const again = await auth.oauthSignIn('google', { idToken: googleToken() });
      expect(again.created).toBe(false);
      expect(again.user.id).toBe(first.user.id);
      // Refresh works for accounts without a password.
      expect((await auth.refresh(again.tokens.refreshToken)).user.id).toBe(first.user.id);
      // No password: password login is refused, setting a first password works.
      expect(await code(auth.login({ login: 'Ahmad_Shouly', password: 'anything-goes-1' }))).toBe('invalid_credentials');
      await auth.changePassword(first.user.id, undefined, 'a much better pass 9');
      expect((await auth.login({ login: 'ahmad@example.com', password: 'a much better pass 9' })).user.id).toBe(first.user.id);
    });

    it('links Google to an existing password account with the same verified email', async () => {
      const existing = await auth.signup({ username: 'sara_k', email: 'sara@example.com', password: 'correct horse battery' });
      const res = await auth.oauthSignIn('google', { idToken: googleToken({ sub: 'g-sara', email: 'sara@example.com', name: 'Sara' }) });
      expect(res.created).toBe(false);
      expect(res.user.id).toBe(existing.user.id);
      // An unverified email is never used to link.
      const other = await auth.oauthSignIn('google', { idToken: googleToken({ sub: 'g-unverified', email: 'sara@example.com', email_verified: false, name: 'Sara' }) });
      expect(other.user.id).not.toBe(existing.user.id);
      expect(other.user.email).toBe('');
    });

    it('signs in with Apple, using the name sent on first sign-in, also from Expo Go', async () => {
      const res = await auth.oauthSignIn('apple', { idToken: appleToken(), fullName: 'Lena Ivanova' });
      expect(res.user.username).toBe('Lena_Ivanova');
      expect(res.user.email).toBe('relay@privaterelay.appleid.com');
      const expoGo = await auth.oauthSignIn('apple', { idToken: appleToken({ aud: 'host.exp.Exponent' }) });
      expect(expoGo.user.id).toBe(res.user.id);
      // Apple without an email still gets an account.
      const noEmail = await auth.oauthSignIn('apple', { idToken: appleToken({ sub: 'a-noemail', email: undefined }) });
      expect(noEmail.user.email).toBe('');
      expect((await auth.getUser(noEmail.user.id))?.id).toBe(noEmail.user.id);
    });

    it('gives a second person with the same name a different username', async () => {
      const res = await auth.oauthSignIn('google', { idToken: googleToken({ sub: 'g-other', email: 'other@example.com' }) });
      expect(res.user.username).not.toBe('Ahmad_Shouly');
      expect(res.user.username).toMatch(/^Ahmad_Shouly\d+$/);
    });

    it('refuses bad tokens', async () => {
      expect(await code(auth.oauthSignIn('google', { idToken: googleToken({ aud: 'x' }) }))).toBe('invalid_token');
      expect(await code(auth.oauthSignIn('apple', { idToken: googleToken() }))).toBe('invalid_token');
      expect(await code(auth.oauthSignIn('google', {}))).toBe('invalid_input');
    });

    it('lets accounts without a password be deleted', async () => {
      const res = await auth.oauthSignIn('google', { idToken: googleToken({ sub: 'g-del', email: 'del@example.com', name: 'Del' }) });
      await auth.deleteAccount(res.user.id, undefined);
      expect(await auth.getUser(res.user.id)).toBeNull();
      const back = await auth.oauthSignIn('google', { idToken: googleToken({ sub: 'g-del', email: 'del@example.com', name: 'Del' }) });
      expect(back.created).toBe(true);
    });
  });
}

oauthSuite('Google and Apple sign-in (memory store)', async () => ({ store: new MemoryAuthStore() }));

let h: DbHandle;
oauthSuite('Google and Apple sign-in (Postgres)', async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  return { store: new DbAuthStore(h.db), close: () => h.close() };
});

describe('HTTP routes', () => {
  it('lists providers, answers not_configured, and signs in', async () => {
    const off = new AuthService({ store: new MemoryAuthStore(), mailer, secret: SECRET, now: () => NOW });
    const on = new AuthService({ store: new MemoryAuthStore(), mailer, secret: SECRET, oauth: verifier(), now: () => NOW });
    const servers = [off, on].map((a) => {
      const route = authRoutes(a, { rateLimit: false });
      return createServer((req, res) => void route(req, res, new URL(req.url ?? '/', 'http://x')));
    });
    await Promise.all(servers.map((s) => new Promise<void>((r) => s.listen(0, r))));
    const [offUrl, onUrl] = servers.map((s) => `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/auth`);
    try {
      expect(await (await fetch(`${offUrl}/providers`)).json()).toEqual({ providers: { google: false, apple: false } });
      const post = (base: string, path: string, body: unknown) =>
        fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      expect((await post(offUrl!, '/google', { idToken: googleToken() })).status).toBe(503);
      expect(await (await fetch(`${onUrl}/providers`)).json()).toEqual({ providers: { google: true, apple: true } });
      const first = await post(onUrl!, '/google', { idToken: googleToken() });
      expect(first.status).toBe(201);
      const body = (await first.json()) as { user: { username: string }; tokens: { accessToken: string } };
      expect(body.user.username).toBe('Ahmad_Shouly');
      expect(body.tokens.accessToken).toBeTruthy();
      expect((await post(onUrl!, '/google', { idToken: googleToken() })).status).toBe(200);
      expect((await post(onUrl!, '/apple', { idToken: 'junk' })).status).toBe(401);
    } finally {
      servers.forEach((s) => s.close());
    }
  });
});
