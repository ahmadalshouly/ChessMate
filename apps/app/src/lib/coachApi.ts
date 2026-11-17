import type { CoachChatReply, CoachChatRequest, CoachReview, Color, GameAnalysis } from '@chessmate/core';

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
    throw new CoachApiError(`Can't reach the ChessMate server at ${API_BASE}`, 0);
  }
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new CoachApiError(data.message ?? `Coach error (${res.status})`, res.status);
  return data;
}

export function requestReview(analysis: GameAnalysis, perspective: Color, token: string) {
  return post<CoachReview>('/coach/review', { analysis, perspective }, token);
}

export function askCoach(req: CoachChatRequest, token: string) {
  return post<CoachChatReply>('/coach/chat', req, token);
}
