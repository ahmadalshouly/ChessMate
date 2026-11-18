import type { ChatLine, ReportReason } from './chat';
import type { RatingCategory } from './ratingSystem';
import type { RoleTag } from './roleTags';
import type { ChessTitle, TitleApplication } from './titles';

/**
 * Admin console contract, shared by the server (/api/admin/*) and the app.
 *
 * Roles: every account is a `user`. Staff are `moderator` (community safety:
 * reports, chat, fair-play review, warnings) or `admin` (everything, including
 * account closure, rating changes, staff roles and live game control).
 */
export type StaffRole = 'user' | 'moderator' | 'admin';

export const STAFF_ROLES: readonly StaffRole[] = ['user', 'moderator', 'admin'];

export const ADMIN_PERMISSIONS = [
  'dashboard.view',
  'players.view',
  /** See email addresses and sign-in details. */
  'players.pii',
  'players.warn',
  'players.mute',
  'players.rename',
  'players.note',
  'players.signout',
  'accounts.close',
  'accounts.reopen',
  'ratings.adjust',
  'roles.manage',
  'reports.view',
  'reports.resolve',
  'fairplay.view',
  /** Open, annotate and dismiss cases. */
  'fairplay.review',
  /** Close an account for fair play and refund its opponents. */
  'fairplay.ban',
  'games.view',
  'games.abort',
  'audit.view',
  /** Approve or reject title applications. */
  'titles.review',
  /** Grant or take away a title directly, e.g. after a fair-play closure. */
  'titles.revoke',
  /** Give or remove official role tags (staff, streamer, coach, ...). Admins only. */
  'tags.manage',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const MODERATOR: readonly AdminPermission[] = [
  'dashboard.view',
  'players.view',
  'players.warn',
  'players.mute',
  'players.rename',
  'players.note',
  'reports.view',
  'reports.resolve',
  'fairplay.view',
  'fairplay.review',
  'games.view',
  'audit.view',
  'titles.review',
];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly AdminPermission[]> = {
  user: [],
  moderator: MODERATOR,
  admin: ADMIN_PERMISSIONS,
};

export function isStaff(role: StaffRole | null | undefined): boolean {
  return role === 'moderator' || role === 'admin';
}

export function hasPermission(role: StaffRole | null | undefined, p: AdminPermission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(p);
}

export const ACCOUNT_CLOSE_REASONS = ['fair_play', 'abuse', 'multiple_accounts', 'requested', 'other'] as const;
export type AccountCloseReason = (typeof ACCOUNT_CLOSE_REASONS)[number];

/** Warning categories match the player report reasons. */
export const WARNING_CATEGORIES = ['abusive_chat', 'cheating', 'spam', 'offensive_name', 'unsporting', 'other'] as const;
export type WarningCategory = (typeof WARNING_CATEGORIES)[number];

/** Mute lengths offered in the console, in hours. */
export const MUTE_PRESETS_HOURS = [1, 24, 72, 168, 720] as const;
/** Largest single manual rating change. */
export const MAX_RATING_ADJUSTMENT = 800;

export type FairPlayStatus = 'none' | 'open' | 'dismissed' | 'banned';
export type ReportStatus = 'open' | 'dismissed' | 'actioned';
export type ReportAction = 'dismiss' | 'warn' | 'chat_ban' | 'unban';

// ---------------------------------------------------------------- responses

export interface AdminMe {
  id: string;
  username: string;
  role: StaffRole;
  permissions: AdminPermission[];
}

export interface AdminPlayerSummary {
  id: string;
  username: string;
  displayName: string;
  /** Null when the viewer lacks `players.pii` or the account has none. */
  email: string | null;
  country: string | null;
  role: StaffRole;
  status: 'active' | 'closed';
  closedReason: string | null;
  createdAt: number;
  lastSeenAt: number | null;
  online: boolean;
  /** Live game id when playing right now. */
  playingGameId: string | null;
  blitz: number;
  chatMutedUntil: number | null;
  openReports: number;
  fairPlay: FairPlayStatus;
  /** Verified chess title. */
  title: ChessTitle | null;
  /** Official role tag (staff, streamer, coach, ...). */
  roleTag: RoleTag | null;
  /** Development-only identities (no password, email or Google/Apple link). */
  devAccount: boolean;
}

export interface AdminRatingRow {
  category: RatingCategory;
  rating: number;
  rd: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  peak: number | null;
  provisional: boolean;
}

export interface AdminWarning {
  id: string;
  category: string;
  message: string;
  issuedByName: string;
  reportId: string | null;
  at: number;
}

export interface AdminAuditEntry {
  id: string;
  at: number;
  actorId: string;
  actorName: string;
  /** e.g. account.close, chat.mute, rating.adjust, fairplay.dismiss, role.change. */
  action: string;
  targetType: 'user' | 'report' | 'game' | 'case' | 'system';
  targetId: string | null;
  targetName: string | null;
  reason: string | null;
  details: Record<string, unknown>;
}

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
  status: ReportStatus;
  resolution?: { action: ReportAction; note: string; by: string; at: number };
  targetReportCount?: number;
  targetChatBan?: { until: number } | null;
}

export interface AdminGameSide {
  id: string | null;
  name: string;
  ratingBefore: number | null;
  ratingAfter: number | null;
  accuracy: number | null;
}

export interface AdminGameSummary {
  id: string;
  white: AdminGameSide;
  black: AdminGameSide;
  category: RatingCategory;
  initialMs: number;
  incrementMs: number;
  rated: boolean;
  status: 'active' | 'finished' | 'aborted';
  result: string;
  endReason: string | null;
  plyCount: number;
  startedAt: number;
  endedAt: number | null;
  /** Being played on this server right now. */
  live: boolean;
}

export interface AdminGameDetail extends AdminGameSummary {
  initialFen: string;
  finalFen: string | null;
  pgn: string | null;
  /** SAN moves. */
  moves: string[];
  /** In-game chat while the game is live or still kept in memory. */
  chat: ChatLine[];
  spectators: number;
}

/** One analysed game side from the engine-correlation analysis. */
export interface AdminEngineReport {
  gameId: string;
  color: 'w' | 'b';
  rating: number;
  moves: number;
  accuracy: number;
  expectedAccuracy: number;
  accuracyZ: number;
  topMatches: number;
  matchRate: number;
  expectedMatchRate: number;
  acpl: number;
  meanThinkMs: number;
  thinkCv: number;
  analyzedAt: number;
}

export interface AdminFairPlayAssessment {
  games: number;
  moves: number;
  accuracyZ: number;
  matchZ: number;
  mechanicalTimingGames: number;
  score: number;
  reasons: string[];
}

export interface AdminFairPlayCase {
  playerId: string;
  username: string;
  status: 'open' | 'dismissed' | 'banned';
  score: number;
  reasons: string[];
  assessment: AdminFairPlayAssessment | null;
  openedAt: number;
  updatedAt: number;
  /** Player reports for cheating against this account. */
  cheatingReports: number;
}

export interface AdminFairPlayLogEntry {
  at: number;
  action: string;
  by: string;
  note?: string;
}

export interface AdminFairPlayFile {
  player: AdminPlayerSummary | null;
  case: AdminFairPlayCase | null;
  ban: { reason: string; bannedAt: number; by: string; refunds: { gameId: string; playerId: string; category: string; points: number }[] } | null;
  reports: AdminEngineReport[];
  log: AdminFairPlayLogEntry[];
  /** Whether engine analysis runs on this server (STOCKFISH_PATH or the WASM engine). */
  analysisEnabled: boolean;
}

export interface AdminPlayerDetail extends AdminPlayerSummary {
  closed: { at: number; reason: string; note: string | null; by: string | null } | null;
  ratings: AdminRatingRow[];
  warnings: AdminWarning[];
  chatMute: { until: number; reason: string } | null;
  reportsAgainst: AdminReport[];
  reportsFiled: number;
  fairPlayCase: AdminFairPlayCase | null;
  recentGames: AdminGameSummary[];
  audit: AdminAuditEntry[];
  /** Staff notes are audit entries with action "note". */
  notes: AdminAuditEntry[];
  titleGrantedAt: number | null;
  titleApplications: TitleApplication[];
}

export interface AdminDashboard {
  live: { playersOnline: number; gamesInProgress: number; playersSeeking: number };
  accounts: { total: number; new24h: number; new7d: number; closed: number; staff: number };
  games: { last24h: number; rated24h: number; total: number };
  queues: { openReports: number; openFairPlay: number; activeMutes: number; warnings7d: number; titleApplications: number };
  daily: { day: string; signups: number; games: number }[];
  recent: AdminAuditEntry[];
}
