import { translate, type TKey } from '@/i18n';
import { i18nStore } from '@/i18n/store';

import { ApiError } from './client';

/** Server error codes with friendly, translated copy (`auth.errors.<code>`). */
const KNOWN = new Set(['invalid_credentials', 'username_taken', 'email_taken', 'weak_password', 'invalid_token', 'rate_limited']);

export interface FormError {
  /** Field the error belongs to, when the server says so. */
  field?: string;
  message: string;
}

export function toFormError(e: unknown): FormError {
  if (e instanceof ApiError) {
    // The server explains weak passwords precisely (too common, matches username), so prefer its
    // English text in English; other languages get the translated general advice.
    const useServer = e.code === 'weak_password' && e.message && i18nStore.get().lang === 'en';
    const message = useServer ? e.message : KNOWN.has(e.code) ? translate(`auth.errors.${e.code}` as TKey) : e.message;
    const field = e.field ?? (e.code === 'username_taken' ? 'username' : e.code === 'email_taken' ? 'email' : e.code === 'weak_password' ? 'password' : undefined);
    return { field, message };
  }
  return { message: translate('errors.tryAgain') };
}

