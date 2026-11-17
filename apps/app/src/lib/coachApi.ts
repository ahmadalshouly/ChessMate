import type { CoachChatReply, CoachChatRequest, CoachReview, Color, GameAnalysis } from '@chessmate/core';

import { translate } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { i18nStore } from '@/i18n/store';
import { SERVER_URL } from '@/lib/config';

/** HTTP base of the game server, derived from its WebSocket URL. */
export const API_BASE = SERVER_URL.replace(/^ws/, 'http').replace(/\/ws\/?$/, '');

export class CoachApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CoachApiError(translate('common.errors.unreachable', { url: API_BASE }), 0);
  }
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new CoachApiError(serverText(data.message ?? translate('coach.error', { status: res.status })), res.status);
  return data;
}

export function requestReview(analysis: GameAnalysis, perspective: Color, token: string) {
  return post<CoachReview>('/coach/review', { analysis, perspective, language: i18nStore.get().lang }, token);
}

export function askCoach(req: CoachChatRequest, token: string) {
  return post<CoachChatReply>('/coach/chat', { language: i18nStore.get().lang, ...req }, token);
}
