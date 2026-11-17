import { createHmac, timingSafeEqual } from 'node:crypto';

/** Minimal HS256 JWT (RFC 7519) so the server needs no extra dependency. */
export interface JwtClaims {
  sub: string;
  iat: number;
  exp: number;
  [k: string]: unknown;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export function signJwt(claims: JwtClaims, secret: string): string {
  const body = `${HEADER}.${b64url(JSON.stringify(claims))}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

/** Returns the claims when the signature is valid and the token has not expired; otherwise null. */
export function verifyJwt(token: string, secret: string, nowSec: number): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  if (h !== HEADER) return null; // pins alg=HS256, rejects "none" and alg confusion
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as JwtClaims;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
    if (claims.exp <= nowSec) return null;
    return claims;
  } catch {
    return null;
  }
}

export function looksLikeJwt(token: string): boolean {
  return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token);
}
