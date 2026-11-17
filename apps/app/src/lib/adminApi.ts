import type { ChatLine, ReportReason } from '@chessmate/core';

import { SERVER_URL } from './config';

/** HTTP base of the game server, derived from its WebSocket URL (ws://host:8787/ws -> http://host:8787). */
export const API_BASE = SERVER_URL.replace(/^ws(s?):/, 'http$1:').replace(/\/ws\/?$/, '');

export type ModAction = 'dismiss' | 'warn' | 'chat_ban' | 'unban';

export interface AdminReport {
  id: string;
  reporterId: string;
  reporterName: string;
  targetId: string;
  targetName: string;
  gameId: string | null;
  reason: ReportReason;
  note: string;
  chat: ChatLine[];
  moves: string[];
  createdAt: number;
  status: 'open' | 'dismissed' | 'actioned';
  resolution?: { action: ModAction; note: string; by: string; at: number };
  targetReportCount?: number;
  targetChatBan?: { until: number } | null;
}

export interface AdminChatBan {
  playerId: string;
  name: string;
  until: number;
  reason: string;
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/admin${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export const adminApi = {
  reports: (token: string, status: 'open' | 'all') => call<{ reports: AdminReport[] }>(token, `/reports?status=${status}`).then((r) => r.reports),
  resolve: (token: string, id: string, action: ModAction, durationHours?: number, note?: string) =>
    call<{ report: AdminReport }>(token, `/reports/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ action, durationHours, note }) }),
  bans: (token: string) => call<{ bans: AdminChatBan[] }>(token, '/chat-bans').then((r) => r.bans),
  unban: (token: string, playerId: string) => call<{ ok: true }>(token, `/chat-bans/${encodeURIComponent(playerId)}`, { method: 'DELETE' }),
};
