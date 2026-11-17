import type { PuzzleAttemptResponse, PuzzleDto, PuzzleProfileDto, PuzzleRunMode } from '@chessmate/core';
import { Platform } from 'react-native';

import { SERVER_URL } from './config';

/** HTTP base of the game server, derived from its WebSocket URL. */
export const API_BASE = SERVER_URL.replace(/^ws/, 'http').replace(/\/ws\/?$/, '');

let tokenProvider: () => string | null = deviceToken;

/**
 * Lets the accounts feature supply the signed-in session token. Until then
 * the app uses an anonymous device id so puzzle rating and best scores are
 * kept per device (across restarts on web; per app session on native).
 */
export function setPuzzleAuthToken(provider: () => string | null) {
  tokenProvider = provider;
}

let memoryId: string | null = null;
function deviceToken(): string {
  const key = 'chessmate.deviceId';
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(key);
      if (saved) return `anon:${saved}`;
    }
  } catch {
    // Storage blocked: fall through to an in-memory id.
  }
  memoryId ??= Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') localStorage.setItem(key, memoryId);
  } catch {
    // ignore
  }
  return `anon:${memoryId}`;
}

export class PuzzleApiError extends Error {}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const token = tokenProvider();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/puzzles${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new PuzzleApiError(`Can't reach the puzzle server at ${API_BASE}. Is it running (pnpm dev:server)?`);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new PuzzleApiError(data.error ?? `Request failed (${res.status})`);
  return data;
}

export const puzzleApi = {
  profile: () => call<PuzzleProfileDto>('/me'),
  themes: () => call<{ counts: Record<string, number> }>('/themes'),
  daily: () => call<{ day: string; puzzle: PuzzleDto; attempted: boolean }>('/daily'),
  byId: (id: string) => call<{ puzzle: PuzzleDto }>(`/${encodeURIComponent(id)}`),
  next: (opts: { theme?: string; skip?: string[] } = {}) => {
    const q = new URLSearchParams();
    if (opts.theme) q.set('theme', opts.theme);
    if (opts.skip?.length) q.set('skip', opts.skip.slice(-50).join(','));
    const s = q.toString();
    return call<{ puzzle: PuzzleDto }>(`/next${s ? `?${s}` : ''}`);
  },
  attempt: (id: string, body: { moves: string[]; hints: number; timeMs: number; rated: boolean }) =>
    call<PuzzleAttemptResponse>(`/${encodeURIComponent(id)}/attempt`, body),
  run: (mode: PuzzleRunMode, offset: number) => call<{ puzzles: PuzzleDto[] }>(`/run?mode=${mode}&offset=${offset}`),
  saveRun: (mode: PuzzleRunMode, score: number) => call<{ saved: boolean; best: number; newBest?: boolean }>('/run', { mode, score }),
};
