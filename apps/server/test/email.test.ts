import { describe, expect, it } from 'vitest';
import { LogEmailSender, ResendEmailSender, emailSenderFromEnv } from '../src/email';
import { closedNotice, reopenedNotice, warningNotice } from '../src/admin/notices';

describe('email', () => {
  it('prints to the console by default and when a provider is missing its key', () => {
    const warnings: string[] = [];
    expect(emailSenderFromEnv({}, (m) => warnings.push(m)).name).toBe('log');
    expect(emailSenderFromEnv({ EMAIL_PROVIDER: 'resend' }, (m) => warnings.push(m)).name).toBe('log');
    expect(warnings[0]).toMatch(/RESEND_API_KEY/);
    expect(emailSenderFromEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' }).name).toBe('resend');
  });

  it('sends through Resend with the API key, sender and both bodies', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{"id":"1"}', { status: 200 });
    }) as unknown as typeof fetch;
    await new ResendEmailSender('key', 'ChessMate <a@b.c>', fake).send({ to: 'p@x.y', subject: 'S', text: 'T', html: '<p>T</p>', tag: 'fair_play' });
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer key');
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ from: 'ChessMate <a@b.c>', to: ['p@x.y'], subject: 'S', text: 'T', html: '<p>T</p>' });

    const failing = (async () => new Response('bad', { status: 422 })) as unknown as typeof fetch;
    await expect(new ResendEmailSender('key', 'a@b.c', failing).send({ to: 'p@x.y', subject: 'S', text: 'T' })).rejects.toThrow(/422/);
  });

  it('keeps a log of what it printed', async () => {
    const lines: string[] = [];
    const s = new LogEmailSender((l) => lines.push(l));
    await s.send({ to: 'p@x.y', subject: 'Hello', text: 'Body' });
    expect(s.sent).toHaveLength(1);
    expect(lines[0]).toContain('Hello');
  });

  it('words fair-play notices for the player', () => {
    expect(warningNotice({ username: 'a', category: 'cheating', message: 'm' })).toMatchObject({ category: 'fair_play', title: 'Fair play warning' });
    expect(warningNotice({ username: 'a', category: 'spam', message: 'm' }).category).toBe('moderation');
    const closed = closedNotice({ username: 'a', reason: 'fair_play' });
    expect(closed.email.text).toMatch(/still sign in/);
    expect(closedNotice({ username: 'a', reason: 'abuse' }).body).toMatch(/can no longer sign in/);
    expect(reopenedNotice({ username: 'a', previousReason: 'fair_play' }).title).toBe('Fair play restriction lifted');
  });
});
