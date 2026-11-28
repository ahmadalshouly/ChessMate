import type {
  AccountCloseReason,
  MaintenanceState,
  AdPlacementInput,
  AdPlacementView,
  AdSpotState,
  OnlineBotInput,
  OnlineBotView,
  Campaign,
  CampaignAudience,
  CampaignInput,
  CampaignMessage,
  PushHealth,
  AdminAuditEntry,
  AdminDashboard,
  AnalyticsRange,
  AnalyticsReport,
  AdminEngineReport,
  AdminFairPlayCase,
  AdminFairPlayFile,
  AdminFairPlayGame,
  AdminGameDetail,
  AdminGameSummary,
  AdminLesson,
  AdminLessonChapter,
  LessonChapterInput,
  LessonInput,
  PuzzleDto,
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
  PayoutRequestView,
  SponsorApplicationView,
  SponsorMessageView,
  SponsorPaymentView,
  StaffRole,
  TournamentChatMessage,
  TournamentDetail,
  TournamentGameView,
  TournamentInput,
  TournamentSummary,
} from '@chessmate/core';

import { useMemo } from 'react';

import { useAuth } from '@/lib/auth';

/**
 * A placement as the console's form sends it: `period` is the shorthand the
 * server turns into `endsAt`, and `image` left out keeps the stored one.
 */
export type AdPlacementForm = Partial<Omit<AdPlacementInput, 'startsAt' | 'endsAt'>> & {
  spot: AdPlacementInput['spot'];
  startsAt?: number;
  endsAt?: number;
  period?: string;
};

/** An online bot as the console's form sends it: `image` left out keeps the stored picture. */
export type OnlineBotForm = OnlineBotInput;

/** Admin live view of a tournament (see TournamentService.adminDetail on the server). */
export interface AdminTournamentView extends TournamentDetail {
  roster: {
    userId: string;
    username: string;
    rating: number;
    score: number;
    games: number;
    withdrawn: boolean;
    disqualified: boolean;
    paid: boolean;
    rulesAcceptedAt: number | null;
    joinedAt: number;
    playing: boolean;
  }[];
  payments: { userId: string; amountCents: number; currency: string; status: string; createdAt: number }[];
  revenueCents: number;
  /** Every game, including aborted ones and games still running, newest first. */
  allGames: TournamentGameView[];
  /** The whole chat, hidden messages included. */
  chat: TournamentChatMessage[];
}

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
      analytics: (days: AnalyticsRange) => get<AnalyticsReport>(`/analytics?days=${days}`),
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
      /** Give the opponents of a case's last `games` rated games their points back. */
      refundFairPlay: (playerId: string, games: number, note: string) =>
        post<{ refunds: { playerId: string; points: number }[]; players: number }>(`/fairplay/${id(playerId)}/refund`, { games, note }),
      /** Recent rated games of a case that a moderator's device can analyse. */
      fairPlayGames: (playerId: string, limit?: number) => get<{ games: AdminFairPlayGame[] }>(`/fairplay/${id(playerId)}/games${qs({ limit })}`).then((r) => r.games),
      /** Engine results from this device for one of those games; the server checks and grades them. */
      submitFairPlayAnalysis: (playerId: string, gameId: string, depth: number, evals: unknown[]) =>
        post<{ reports: AdminEngineReport[] }>(`/fairplay/${id(playerId)}/analysis`, { gameId, depth, evals }),
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
      campaigns: () => get<{ campaigns: Campaign[]; health: PushHealth }>('/campaigns'),
      campaign: (cid: string) => get<{ campaign: Campaign }>(`/campaigns/${id(cid)}`).then((r) => r.campaign),
      createCampaign: (c: CampaignInput, go: boolean) => post<{ campaign: Campaign }>('/campaigns', { ...c, go }).then((r) => r.campaign),
      saveCampaign: (cid: string, c: CampaignInput, go: boolean) => post<{ campaign: Campaign }>(`/campaigns/${id(cid)}`, { ...c, go }).then((r) => r.campaign),
      campaignAction: (cid: string, action: 'launch' | 'pause' | 'resume' | 'cancel' | 'delete') => post(`/campaigns/${id(cid)}/action`, { action }),
      campaignPreview: (audience: CampaignAudience) => post<{ count: number; sample: string[]; withPush: number }>('/campaign-preview', { audience }),
      campaignTest: (message: CampaignMessage) => post<{ devices: number; push: string }>('/campaign-test', { message }),
      tournaments: () => get<{ tournaments: TournamentSummary[] }>('/tournaments').then((r) => r.tournaments),
      /** Open accounts matching a username, to invite to a private tournament. */
      invitees: (q: string) => get<{ players: { userId: string; username: string; displayName: string | null }[] }>(`/invitees${qs({ q })}`).then((r) => r.players),
      createTournament: (t: TournamentInput) => post<{ tournament: TournamentDetail }>('/tournaments', { ...t }).then((r) => r.tournament),
      updateTournament: (tid: string, t: Partial<TournamentInput>) => post<{ tournament: TournamentDetail }>(`/tournaments/${id(tid)}`, { ...t }).then((r) => r.tournament),
      cancelTournament: (tid: string, reason: string) => post<{ tournament: TournamentDetail }>(`/tournaments/${id(tid)}/cancel`, { reason }).then((r) => r.tournament),
      startTournament: (tid: string) => post<{ tournament: TournamentDetail }>(`/tournaments/${id(tid)}/start`).then((r) => r.tournament),
      tournamentMonitor: (tid: string) => get<{ tournament: AdminTournamentView }>(`/tournaments/${id(tid)}`).then((r) => r.tournament),
      removeTournamentPlayer: (tid: string, userId: string, reason: string) => post(`/tournaments/${id(tid)}/remove`, { userId, reason }),
      postTournamentChat: (tid: string, text: string) => post<{ message: TournamentChatMessage }>(`/tournaments/${id(tid)}/chat`, { text }).then((r) => r.message),
      hideTournamentChat: (tid: string, messageId: string, hidden: boolean) =>
        post<{ message: TournamentChatMessage }>(`/tournaments/${id(tid)}/hidechat`, { messageId, hidden }).then((r) => r.message),
      sponsors: () => get<{ applications: SponsorApplicationView[] }>('/sponsors').then((r) => r.applications),
      reviewSponsor: (aid: string, status: string, note: string) => post(`/sponsors/${id(aid)}`, { status, note }),
      /** Emails the company asking for the title, text, image and link. */
      requestSponsorMaterial: (aid: string) => post<{ application: SponsorApplicationView }>(`/sponsors/${id(aid)}/material`).then((r) => r.application),
      /** The conversation with the company and its payment links. Opening it marks their messages read. */
      sponsorThread: (aid: string) => get<{ thread: SponsorThread }>(`/sponsors/${id(aid)}/thread`).then((r) => r.thread),
      sponsorMessage: (aid: string, body: string) => post<{ thread: SponsorThread }>(`/sponsors/${id(aid)}/message`, { body }).then((r) => r.thread),
      sponsorPaymentLink: (aid: string, p: { amountCents: number; currency: string; description: string }) => post<{ thread: SponsorThread }>(`/sponsors/${id(aid)}/payment`, p).then((r) => r.thread),
      cancelSponsorPayment: (aid: string, paymentId: string) => post<{ thread: SponsorThread }>(`/sponsors/${id(aid)}/cancel-payment`, { paymentId }).then((r) => r.thread),
      payments: () => get<PaymentsOverview>('/payments'),
      /** Shows or hides "Support us" in the app, without a new build. */
      setSupportShown: (shown: boolean) => post<{ shown: boolean }>('/payments/support', { shown }),
      /** The web maintenance page: on/off, title, text, countdown. */
      maintenance: () => get<{ maintenance: MaintenanceState }>('/maintenance').then((r) => r.maintenance),
      setMaintenance: (patch: Partial<Pick<MaintenanceState, 'active' | 'title' | 'description' | 'endsAt' | 'autoEnd'>>) =>
        post<{ maintenance: MaintenanceState }>('/maintenance', patch).then((r) => r.maintenance),
      ads: () => get<{ spots: AdSpotState[]; placements: AdPlacementView[] }>('/ads'),
      setAdSpot: (spot: string, patch: { enabled?: boolean; note?: string }) => post<{ spot: AdSpotState }>(`/ads-spots/${id(spot)}`, patch).then((r) => r.spot),
      createAdPlacement: (p: AdPlacementForm) => post<{ placement: AdPlacementView }>('/ads', { ...p }).then((r) => r.placement),
      saveAdPlacement: (pid: string, p: AdPlacementForm) => post<{ placement: AdPlacementView }>(`/ads/${id(pid)}`, { ...p }).then((r) => r.placement),
      stopAdPlacement: (pid: string, stopped: boolean) => post<{ placement: AdPlacementView }>(`/ads/${id(pid)}/stop`, { stopped }).then((r) => r.placement),
      deleteAdPlacement: (pid: string) => post(`/ads/${id(pid)}/delete`),
      bots: () => get<{ bots: OnlineBotView[] }>('/bots').then((r) => r.bots),
      createBot: (b: OnlineBotForm) => post<{ bot: OnlineBotView }>('/bots', { ...b }).then((r) => r.bot),
      saveBot: (bid: string, b: OnlineBotForm) => post<{ bot: OnlineBotView }>(`/bots/${id(bid)}`, { ...b }).then((r) => r.bot),
      setBotFlags: (bid: string, flags: { enabled?: boolean; featured?: boolean }) => post<{ bot: OnlineBotView }>(`/bots/${id(bid)}/flags`, flags).then((r) => r.bot),
      deleteBot: (bid: string) => post(`/bots/${id(bid)}/delete`),
      payouts: () => get<{ requests: PayoutRequestView[] }>('/payouts').then((r) => r.requests),
      reviewPayout: (pid: string, status: string, note: string) => post(`/payouts/${id(pid)}`, { status, note }),
      lessons: () => get<{ chapters: AdminLessonChapter[] }>('/lessons').then((r) => r.chapters),
      createLesson: (l: LessonInput) => post<{ lesson: AdminLesson }>('/lessons', { ...l }).then((r) => r.lesson),
      saveLesson: (l: LessonInput) => post<{ lesson: AdminLesson }>(`/lessons/${id(l.id)}`, { ...l }).then((r) => r.lesson),
      deleteLesson: (lid: string) => post(`/lessons/${id(lid)}/delete`),
      moveLesson: (lid: string, delta: number) => post<{ chapters: AdminLessonChapter[] }>(`/lessons/${id(lid)}/move`, { delta }).then((r) => r.chapters),
      saveLessonChapter: (c: LessonChapterInput) => post<{ chapter: AdminLessonChapter }>('/lesson-chapters', { ...c }).then((r) => r.chapter),
      deleteLessonChapter: (cid: string) => post(`/lesson-chapters/${id(cid)}/delete`),
      moveLessonChapter: (cid: string, delta: number) => post<{ chapters: AdminLessonChapter[] }>(`/lesson-chapters/${id(cid)}/move`, { delta }).then((r) => r.chapters),
      lessonPuzzles: (q: { theme?: string; rating?: number; id?: string }) => get<{ puzzles: PuzzleDto[] }>(`/lesson-puzzles${qs(q)}`).then((r) => r.puzzles),
    };
  }, [apiFetch]);
}

export type AdminApi = ReturnType<typeof useAdminApi>;

/** A sponsor conversation as staff see it. */
export interface SponsorThread {
  messages: SponsorMessageView[];
  payments: SponsorPaymentView[];
  /** The company's own page, to paste into an email. */
  portalUrl: string | null;
  paymentsEnabled: boolean;
}

export interface PaymentsOverview {
  enabled: boolean;
  webhook: boolean;
  /** Whether the app shows "Support us". */
  supportShown: boolean;
  sponsorPayments: (SponsorPaymentView & { applicationId: string; sponsor: string })[];
  donations: {
    last30: Record<string, { cents: number; count: number }>;
    allTime: Record<string, { cents: number; count: number }>;
    recent: { id: string; amountCents: number; currency: string; email: string | null; paidAt: number | null; createdAt: number }[];
  };
}
