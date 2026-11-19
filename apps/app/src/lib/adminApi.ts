import type {
  AccountCloseReason,
  AdminAuditEntry,
  AdminDashboard,
  AdminFairPlayCase,
  AdminFairPlayFile,
  AdminGameDetail,
  AdminGameSummary,
  AdminMe,
  AdminPlayerDetail,
  AdminPlayerSummary,
  AdminReport,
  AdminTitleApplication,
  ChessTitle,
  TitleDocumentLink,
  RoleTag,
  TitleRevokeReason,
  RatingCategory,
  ReportAction,
  StaffRole,
  TournamentDetail,
  TournamentInput,
  TournamentSummary,
} from '@chessmate/core';
import { useMemo } from 'react';

import { useAuth } from '@/lib/auth';

export type PlayerFilter = 'all' | 'active' | 'closed' | 'muted' | 'staff';

const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};
const id = (s: string) => encodeURIComponent(s);

/**
 * Staff API (/api/admin) with the signed-in account's token. The server
 * checks the role's permissions on every call; the app only hides what the
 * role cannot do.
 */
export function useAdminApi() {
  const { apiFetch } = useAuth();
  return useMemo(() => {
    const get = <T,>(path: string) => apiFetch<T>(`/api/admin${path}`);
    const post = <T,>(path: string, body: Record<string, unknown> = {}) => apiFetch<T>(`/api/admin${path}`, { method: 'POST', body: JSON.stringify(body) });
    return {
      me: () => get<AdminMe>('/me'),
      dashboard: () => get<AdminDashboard>('/dashboard'),
      players: (q: string, filter: PlayerFilter, offset = 0) =>
        get<{ players: AdminPlayerSummary[]; total: number }>(
          `/players${qs({ q, offset, status: filter === 'active' || filter === 'closed' || filter === 'muted' ? filter : undefined, role: filter === 'staff' ? 'staff' : undefined })}`,
        ),
      player: (playerId: string) => get<{ player: AdminPlayerDetail }>(`/players/${id(playerId)}`).then((r) => r.player),
      warn: (playerId: string, category: string, message: string) => post(`/players/${id(playerId)}/warn`, { category, message }),
      mute: (playerId: string, hours: number, reason: string) => post<{ until: number }>(`/players/${id(playerId)}/mute`, { hours, reason }),
      unmute: (playerId: string, reason: string) => post(`/players/${id(playerId)}/unmute`, { reason }),
      note: (playerId: string, note: string) => post(`/players/${id(playerId)}/note`, { note }),
      rename: (playerId: string, username: string, reason: string) => post(`/players/${id(playerId)}/rename`, { username, reason }),
      signOut: (playerId: string, reason: string) => post(`/players/${id(playerId)}/signout`, { reason }),
      setRole: (playerId: string, role: StaffRole, reason: string) => post(`/players/${id(playerId)}/role`, { role, reason }),
      adjustRating: (playerId: string, category: RatingCategory, delta: number, reason: string) =>
        post<{ before: number; after: number }>(`/players/${id(playerId)}/rating`, { category, delta, reason }),
      close: (playerId: string, reason: AccountCloseReason, note: string) =>
        post<{ refunds: { playerId: string; points: number }[] }>(`/players/${id(playerId)}/close`, { reason, note }),
      reopen: (playerId: string, note: string) => post(`/players/${id(playerId)}/reopen`, { note }),
      reports: (status: string) => get<{ reports: AdminReport[] }>(`/reports${qs({ status })}`).then((r) => r.reports),
      resolveReport: (reportId: string, action: ReportAction, opts: { note?: string; hours?: number; message?: string } = {}) =>
        post(`/reports/${id(reportId)}`, { action, ...opts }),
      fairPlay: (status: string) => get<{ cases: AdminFairPlayCase[] }>(`/fairplay${qs({ status })}`).then((r) => r.cases),
      fairPlayFile: (playerId: string) => get<AdminFairPlayFile>(`/fairplay/${id(playerId)}`),
      openCase: (playerId: string, note: string) => post(`/fairplay/${id(playerId)}/open`, { note }),
      dismissCase: (playerId: string, note: string) => post(`/fairplay/${id(playerId)}/dismiss`, { note }),
      banFairPlay: (playerId: string, note: string) => post<{ refunds: { playerId: string; points: number }[] }>(`/fairplay/${id(playerId)}/ban`, { note }),
      games: (player?: string, before?: number) => get<{ games: AdminGameSummary[] }>(`/games${qs({ player, before })}`).then((r) => r.games),
      game: (gameId: string) => get<{ game: AdminGameDetail }>(`/games/${id(gameId)}`).then((r) => r.game),
      abortGame: (gameId: string, reason: string) => post(`/games/${id(gameId)}/abort`, { reason }),
      audit: (q: { target?: string; actor?: string; action?: string; before?: number } = {}) =>
        get<{ entries: AdminAuditEntry[] }>(`/audit${qs(q)}`).then((r) => r.entries),
      titles: (status: string) => get<{ applications: AdminTitleApplication[] }>(`/titles${qs({ status })}`).then((r) => r.applications),
      titleApplication: (appId: string) => get<{ application: AdminTitleApplication }>(`/titles/${id(appId)}`).then((r) => r.application),
      approveTitle: (appId: string, note: string) => post(`/titles/${id(appId)}/approve`, { note }),
      rejectTitle: (appId: string, note: string) => post(`/titles/${id(appId)}/reject`, { note }),
      documentLink: (docId: string) => get<TitleDocumentLink>(`/documents/${id(docId)}`),
      setTitle: (playerId: string, title: ChessTitle, note: string) => post(`/players/${id(playerId)}/title`, { title, note }),
      removeTitle: (playerId: string, reason: TitleRevokeReason, note: string) => post(`/players/${id(playerId)}/title`, { title: null, reason, note }),
      setRoleTag: (playerId: string, tag: RoleTag | null, note: string) => post(`/players/${id(playerId)}/tag`, { tag, note }),
      messagePlayer: (playerId: string, body: string) => post(`/players/${id(playerId)}/message`, { body }),
      broadcast: (body: string) => post<{ sent: number }>('/broadcast', { body }),
      tournaments: () => get<{ tournaments: TournamentSummary[] }>('/tournaments').then((r) => r.tournaments),
      createTournament: (t: TournamentInput) => post<{ tournament: TournamentDetail }>('/tournaments', { ...t }).then((r) => r.tournament),
      updateTournament: (tid: string, t: Partial<TournamentInput>) => post<{ tournament: TournamentDetail }>(`/tournaments/${id(tid)}`, { ...t }).then((r) => r.tournament),
      cancelTournament: (tid: string, reason: string) => post<{ tournament: TournamentDetail }>(`/tournaments/${id(tid)}/cancel`, { reason }).then((r) => r.tournament),
      startTournament: (tid: string) => post<{ tournament: TournamentDetail }>(`/tournaments/${id(tid)}/start`).then((r) => r.tournament),
    };
  }, [apiFetch]);
}

export type AdminApi = ReturnType<typeof useAdminApi>;
