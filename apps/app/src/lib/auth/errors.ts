import { ApiError } from './client';

/** Friendly copy for server error codes. */
const COPY: Record<string, string> = {
  invalid_credentials: "That username or password doesn't match. Try again.",
  username_taken: 'That username is taken. Try another.',
  email_taken: 'An account with this email already exists. Sign in instead?',
  weak_password: 'Pick a stronger password: at least 8 characters, ideally mixing letters, numbers and symbols.',
  invalid_token: 'This link has expired or was already used. Request a new one.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
};

export interface FormError {
  /** Field the error belongs to, when the server says so. */
  field?: string;
  message: string;
}

export function toFormError(e: unknown): FormError {
  if (e instanceof ApiError) {
    const message = COPY[e.code] ?? e.message;
    const field = e.field ?? (e.code === 'username_taken' ? 'username' : e.code === 'email_taken' ? 'email' : e.code === 'weak_password' ? 'password' : undefined);
    return { field, message };
  }
  return { message: 'Something went wrong. Please try again.' };
}
