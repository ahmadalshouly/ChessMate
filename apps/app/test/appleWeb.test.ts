import { describe, expect, it } from 'vitest';

import { AppleWebCancelled, appleWebSupported, readAppleResponse } from '../src/lib/auth/appleWeb';

describe('Sign in with Apple on the web', () => {
  it('only runs over https on a real domain', () => {
    expect(appleWebSupported({ protocol: 'https:', hostname: 'chessmate.pages.dev' })).toBe(true);
    expect(appleWebSupported({ protocol: 'http:', hostname: 'localhost' })).toBe(false);
    expect(appleWebSupported({ protocol: 'https:', hostname: 'localhost' })).toBe(false);
    expect(appleWebSupported({ protocol: 'https:', hostname: '192.168.1.20' })).toBe(false);
    expect(appleWebSupported(undefined)).toBe(false);
  });

  it('reads the token and the first-time name', () => {
    expect(readAppleResponse({ authorization: { id_token: 'tok', code: 'c' }, user: { email: 'a@b.c', name: { firstName: 'Ahmad', lastName: 'Shouly' } } })).toEqual({
      idToken: 'tok',
      fullName: 'Ahmad Shouly',
    });
    expect(readAppleResponse({ authorization: { id_token: 'tok' } })).toEqual({ idToken: 'tok', fullName: undefined });
  });

  it('treats a closed pop-up as a cancel, and other answers as errors', () => {
    expect(() => readAppleResponse({ error: 'popup_closed_by_user' })).toThrow(AppleWebCancelled);
    expect(() => readAppleResponse({ error: 'invalid_request' })).toThrow(/invalid_request/);
    expect(() => readAppleResponse({ authorization: {} })).toThrow(/No identity token/);
  });
});
