import { openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthError, AuthService, DbAuthStore, type Mailer } from '../src/auth';

const SECRET = 'test-secret-test-secret-test-secret!';

class CaptureMailer implements Mailer {
  last: { email: string; token: string } | null = null;
  async sendPasswordReset(to: { email: string }, token: string) {
    this.last = { email: to.email, token };
  }
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof AuthError ? e.code : String(e);
  }
};

describe('accounts stored in Postgres', () => {
  let h: DbHandle;
  let t = Date.UTC(2026, 0, 1);
  const mailer = new CaptureMailer();
  let auth: AuthService;

  beforeAll(async () => {
    h = openDb({ path: 'memory://' });
    await h.migrate();
    auth = new AuthService({ store: new DbAuthStore(h.db), mailer, secret: SECRET, now: () => t });
  }, 60_000);
  afterAll(() => h.close());

  it('signs up, rejects duplicates, logs in and rotates refresh tokens', async () => {
    const res = await auth.signup({ username: 'Ahmad_1', email: 'Ahmad@Example.com', password: 'correct horse battery' });
    expect(res.user.username).toBe('Ahmad_1');
    expect(await code(auth.signup({ username: 'ahmad_1', email: 'x@example.com', password: 'correct horse battery' }))).not.toBe('ok');
    expect(await code(auth.signup({ username: 'other', email: 'ahmad@example.com', password: 'correct horse battery' }))).not.toBe('ok');

    const login = await auth.login({ login: 'ahmad@example.com', password: 'correct horse battery' });
    expect(auth.verifyAccessToken(login.tokens.accessToken)?.userId).toBe(res.user.id);
    t += 1000;
    const next = await auth.refresh(login.tokens.refreshToken);
    expect(next.tokens.refreshToken).not.toBe(login.tokens.refreshToken);
    // Reusing the rotated token revokes the whole family.
    expect(await code(auth.refresh(login.tokens.refreshToken))).not.toBe('ok');
    expect(await code(auth.refresh(next.tokens.refreshToken))).not.toBe('ok');
  });

  it('resets a password once and deletes the account', async () => {
    const { user } = await auth.signup({ username: 'resetme', email: 'reset@example.com', password: 'first password 1' });
    await auth.forgotPassword('reset@example.com');
    expect(mailer.last?.email).toBe('reset@example.com');
    await auth.resetPassword({ token: mailer.last!.token, password: 'second password 2' });
    expect(await code(auth.resetPassword({ token: mailer.last!.token, password: 'third password 3' }))).not.toBe('ok');
    expect(await code(auth.login({ login: 'resetme', password: 'second password 2' }))).toBe('ok');
    await auth.deleteAccount(user.id, 'second password 2');
    expect(await auth.getUser(user.id)).toBeNull();
    expect(await code(auth.login({ login: 'resetme', password: 'second password 2' }))).not.toBe('ok');
  });
});
