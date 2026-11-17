import { createPublicKey, verify, type JsonWebKey, type KeyObject } from 'node:crypto';
import type { OAuthProvider } from './store';

/**
 * Sign in with Google and Sign in with Apple: the app gets an ID token (a JWT
 * signed by Google or Apple) on the device and posts it here. We check the
 * signature against the provider's published keys, the issuer, the audience
 * (our own client IDs, so tokens minted for other apps are refused) and expiry.
 */

export interface OAuthIdentity {
  provider: OAuthProvider;
  /** Stable account id at the provider (`sub`). */
  subject: string;
  /** Lowercased, or null when the provider did not share one. */
  email: string | null;
  /** True when the provider vouches the address belongs to this person. */
  emailVerified: boolean;
  name: string | null;
}

export class OAuthTokenError extends Error {}

/** Source of public keys by key id. */
export interface KeySource {
  getKey(kid: string): Promise<KeyObject | undefined>;
}

/** Fetches and caches a JWKS document; refetches (at most once a minute) when it sees an unknown key id. */
export function remoteKeys(url: string, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): KeySource {
  let keys = new Map<string, KeyObject>();
  let fetchedAt = -Infinity;
  let pending: Promise<void> | null = null;
  const MAX_AGE = 6 * 3600_000;
  const MIN_REFETCH = 60_000;

  const load = () =>
    (pending ??= (async () => {
      try {
        const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
        const next = new Map<string, KeyObject>();
        for (const jwk of body.keys ?? []) {
          if (jwk.kid && jwk.kty === 'RSA') next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
        }
        keys = next;
        fetchedAt = now();
      } finally {
        pending = null;
      }
    })());

  return {
    async getKey(kid) {
      const age = now() - fetchedAt;
      if (age > MAX_AGE || (!keys.has(kid) && age > MIN_REFETCH)) await load();
      return keys.get(kid);
    },
  };
}

/** Keys from a fixed JWKS document (tests). */
export function staticKeys(jwks: { keys: (JsonWebKey & { kid?: string })[] }): KeySource {
  const keys = new Map(jwks.keys.map((k) => [k.kid!, createPublicKey({ key: k, format: 'jwk' })]));
  return { getKey: async (kid) => keys.get(kid) };
}

export interface VerifyOptions {
  keys: KeySource;
  issuers: string[];
  audiences: string[];
  /** Seconds since epoch. */
  now?: number;
  /** Allowed clock difference in seconds. */
  leeway?: number;
}

const b64json = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;

/** Verifies an RS256 ID token and returns its claims. Throws OAuthTokenError when anything is off. */
export async function verifyIdToken(token: string, opts: VerifyOptions): Promise<Record<string, unknown>> {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) throw new OAuthTokenError('Malformed token');
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = b64json(parts[0]!);
    claims = b64json(parts[1]!);
  } catch {
    throw new OAuthTokenError('Malformed token');
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new OAuthTokenError('Unsupported token');
  const key = await opts.keys.getKey(header.kid);
  if (!key) throw new OAuthTokenError('Unknown signing key');
  const ok = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2]!, 'base64url'));
  if (!ok) throw new OAuthTokenError('Bad signature');

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const leeway = opts.leeway ?? 60;
  if (typeof claims.iss !== 'string' || !opts.issuers.includes(claims.iss)) throw new OAuthTokenError('Wrong issuer');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.some((a) => typeof a === 'string' && opts.audiences.includes(a))) throw new OAuthTokenError('Token is for another app');
  if (typeof claims.exp !== 'number' || claims.exp + leeway < now) throw new OAuthTokenError('Token expired');
  if (typeof claims.iat === 'number' && claims.iat - leeway > now) throw new OAuthTokenError('Token issued in the future');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new OAuthTokenError('Token has no subject');
  return claims;
}

const truthy = (v: unknown) => v === true || v === 'true';

export interface OAuthConfig {
  /** Google OAuth client IDs whose tokens we accept (web, iOS, Android). Empty turns Google off. */
  googleClientIds: string[];
  /** Apple audiences: the iOS bundle ID (and the Services ID for web, if any). Empty turns Apple off. */
  appleClientIds: string[];
  googleKeys?: KeySource;
  appleKeys?: KeySource;
  now?: () => number;
}

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * GOOGLE_CLIENT_IDS: comma-separated Google client IDs.
 * APPLE_CLIENT_IDS: comma-separated Apple audiences, default the app's bundle ID. Outside
 * production Expo Go's bundle ID (host.exp.Exponent) is accepted too, because tokens
 * minted inside Expo Go carry that audience.
 */
export function oauthConfigFromEnv(env = process.env): OAuthConfig {
  const apple = env.APPLE_CLIENT_IDS !== undefined ? list(env.APPLE_CLIENT_IDS) : ['com.chessmate.app'];
  if (env.NODE_ENV !== 'production' && apple.length && !apple.includes('host.exp.Exponent')) apple.push('host.exp.Exponent');
  return { googleClientIds: list(env.GOOGLE_CLIENT_IDS), appleClientIds: apple };
}

export class OAuthVerifier {
  private readonly googleKeys: KeySource;
  private readonly appleKeys: KeySource;
  private readonly now: () => number;

  constructor(readonly config: OAuthConfig) {
    this.googleKeys = config.googleKeys ?? remoteKeys('https://www.googleapis.com/oauth2/v3/certs');
    this.appleKeys = config.appleKeys ?? remoteKeys('https://appleid.apple.com/auth/keys');
    this.now = config.now ?? Date.now;
  }

  enabled(provider: OAuthProvider): boolean {
    return (provider === 'google' ? this.config.googleClientIds : this.config.appleClientIds).length > 0;
  }

  async verify(provider: OAuthProvider, token: string): Promise<OAuthIdentity> {
    const now = Math.floor(this.now() / 1000);
    if (provider === 'google') {
      const c = await verifyIdToken(token, {
        keys: this.googleKeys,
        issuers: ['https://accounts.google.com', 'accounts.google.com'],
        audiences: this.config.googleClientIds,
        now,
      });
      return {
        provider,
        subject: c.sub as string,
        email: typeof c.email === 'string' ? c.email.toLowerCase() : null,
        emailVerified: truthy(c.email_verified),
        name: typeof c.name === 'string' ? c.name : null,
      };
    }
    const c = await verifyIdToken(token, { keys: this.appleKeys, issuers: ['https://appleid.apple.com'], audiences: this.config.appleClientIds, now });
    return {
      provider,
      subject: c.sub as string,
      email: typeof c.email === 'string' ? c.email.toLowerCase() : null,
      // Apple only hands out addresses it has verified (including private relay addresses).
      emailVerified: c.email_verified === undefined ? typeof c.email === 'string' : truthy(c.email_verified),
      name: null,
    };
  }
}
