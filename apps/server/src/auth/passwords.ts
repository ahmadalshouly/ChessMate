import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, len, opts, (e, k) => (e ? rej(e) : res(k))));

/** OWASP-recommended scrypt cost (N=2^17 needs 128 MiB; 2^15 keeps it ~32 MiB per hash). */
const PARAMS = { N: 1 << 15, r: 8, p: 1 };
const KEY_LEN = 64;
const MAX_MEM = 64 * 1024 * 1024;

/** Hashes a password as `scrypt$N$r$p$salt$hash` (base64), salted per user. */
export async function hashPassword(password: string, params = PARAMS): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LEN, { ...params, maxmem: MAX_MEM });
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEM,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** True when a hash was made with weaker parameters than today's, so it should be upgraded on login. */
export function needsRehash(stored: string, params = PARAMS): boolean {
  const [, n, r, p] = stored.split('$');
  return Number(n) !== params.N || Number(r) !== params.r || Number(p) !== params.p;
}
