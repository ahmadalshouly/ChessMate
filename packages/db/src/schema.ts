/**
 * ChessMate database schema (Postgres, Drizzle ORM).
 *
 * Conventions:
 * - Ids are text. Accounts use UUIDs; the column type stays text so dev ids
 *   ("dev:<id>:<name>" tokens) and short game ids fit without conversion.
 * - Timestamps are `timestamptz`, stored in UTC.
 * - Ratings use Glicko-2 (rating, rd, volatility) as in @chessmate/core.
 *
 * After changing this file run `pnpm db:generate` to add a migration.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
});

// ---------------------------------------------------------------- enums

export const userRole = pgEnum('user_role', ['user', 'moderator', 'admin']);
/** Rating pools: the game time categories from @chessmate/core plus puzzles. */
export const ratingCategory = pgEnum('rating_category', [
  'bullet',
  'blitz',
  'rapid',
  'classical',
  'correspondence',
  'puzzle',
]);
export const gameStatus = pgEnum('game_status', ['active', 'finished', 'aborted']);
export const gameResult = pgEnum('game_result', ['1-0', '0-1', '1/2-1/2', '*']);
export const gameEndReason = pgEnum('game_end_reason', [
  'checkmate',
  'stalemate',
  'insufficient_material',
  'threefold_repetition',
  'fifty_move_rule',
  'timeout',
  'timeout_vs_insufficient',
  'resignation',
  'draw_agreement',
  'abandoned',
  'aborted',
]);
export const color = pgEnum('color', ['w', 'b']);
export const friendshipStatus = pgEnum('friendship_status', ['pending', 'accepted', 'blocked']);
export const moveClassification = pgEnum('move_classification', [
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
]);

// ---------------------------------------------------------------- accounts

export const users = pgTable(
  'users',
  {
    id: id(),
    /** Shown in URLs and lobbies. Unique case-insensitively. */
    username: text('username').notNull(),
    /** Stored lowercased. Null for accounts created only through OAuth or dev tokens. */
    email: text('email'),
    emailVerifiedAt: ts('email_verified_at'),
    /** scrypt hash string; null when the account has no password. */
    passwordHash: text('password_hash'),
    passwordChangedAt: ts('password_changed_at'),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    /** ISO 3166-1 alpha-2. */
    country: text('country'),
    role: userRole('role').notNull().default('user'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at'),
    /** Soft delete: keeps game history intact. */
    deletedAt: ts('deleted_at'),
    /**
     * Closed by staff (fair play, abuse, on request). A closed account cannot
     * sign in or play; reopening clears these columns. Unlike deletedAt the
     * account and its username stay reserved.
     */
    closedAt: ts('closed_at'),
    /** fair_play | abuse | multiple_accounts | requested | other */
    closedReason: text('closed_reason'),
    closedNote: text('closed_note'),
    closedBy: text('closed_by'),
    /** Verified chess title (GM, IM, FM, ...), granted by staff. */
    title: text('title'),
    titleGrantedAt: ts('title_granted_at'),
    /** Official role tag next to the name (staff, streamer, coach, ...), set by admins only. */
    roleTag: text('role_tag'),
  },
  (t) => [
    uniqueIndex('users_username_lower_idx').on(sql`lower(${t.username})`),
    uniqueIndex('users_email_idx').on(t.email),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ],
);

/** Refresh-token sessions with rotation: a reused token revokes its whole family. */
export const refreshSessions = pgTable(
  'refresh_sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Every rotation of one login shares a family id. */
    familyId: text('family_id').notNull(),
    /** SHA-256 of the refresh token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    /** Id of the session that replaced this one on rotation. */
    replacedBy: text('replaced_by'),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: createdAt(),
    lastUsedAt: ts('last_used_at'),
  },
  (t) => [
    uniqueIndex('refresh_sessions_token_hash_idx').on(t.tokenHash),
    index('refresh_sessions_user_idx').on(t.userId),
    index('refresh_sessions_family_idx').on(t.familyId),
  ],
);

export const passwordResets = pgTable(
  'password_resets',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    createdAt: createdAt(),
  },
  (t) => [index('password_resets_user_idx').on(t.userId)],
);

/** Sign-in with Apple / Google etc. */
export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] }), index('oauth_accounts_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------- ratings

/** Current rating per user and pool. A missing row means the default 1500 / 350 / 0.06. */
export const ratings = pgTable(
  'ratings',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: ratingCategory('category').notNull(),
    rating: real('rating').notNull().default(1500),
    rd: real('rd').notNull().default(350),
    volatility: real('volatility').notNull().default(0.06),
    games: integer('games').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    peak: real('peak'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category] }), index('ratings_leaderboard_idx').on(t.category, t.rating)],
);

/** One row per rating change, for charts. */
export const ratingHistory = pgTable(
  'rating_history',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: ratingCategory('category').notNull(),
    rating: real('rating').notNull(),
    rd: real('rd').notNull(),
    volatility: real('volatility').notNull(),
    /** The game or puzzle attempt that caused the change. */
    gameId: text('game_id').references(() => games.id, { onDelete: 'set null' }),
    puzzleAttemptId: text('puzzle_attempt_id'),
    createdAt: createdAt(),
  },
  (t) => [index('rating_history_user_idx').on(t.userId, t.category, t.createdAt)],
);

// ---------------------------------------------------------------- games

export const games = pgTable(
  'games',
  {
    id: id(),
    /** Null for guests or deleted accounts; names below keep the history readable. */
    whiteUserId: text('white_user_id').references(() => users.id, { onDelete: 'set null' }),
    blackUserId: text('black_user_id').references(() => users.id, { onDelete: 'set null' }),
    whiteName: text('white_name').notNull(),
    blackName: text('black_name').notNull(),
    initialMs: integer('initial_ms').notNull(),
    incrementMs: integer('increment_ms').notNull(),
    timeCategory: ratingCategory('time_category').notNull(),
    rated: boolean('rated').notNull(),
    initialFen: text('initial_fen').notNull(),
    status: gameStatus('status').notNull().default('active'),
    result: gameResult('result').notNull().default('*'),
    winner: color('winner'),
    endReason: gameEndReason('end_reason'),
    /** Full PGN with headers, written when the game ends. */
    pgn: text('pgn'),
    finalFen: text('final_fen'),
    plyCount: integer('ply_count').notNull().default(0),
    whiteRatingBefore: real('white_rating_before'),
    blackRatingBefore: real('black_rating_before'),
    whiteRatingAfter: real('white_rating_after'),
    blackRatingAfter: real('black_rating_after'),
    /** ECO code and name, filled by the opening detector. */
    eco: text('eco'),
    openingName: text('opening_name'),
    /** Average accuracy per side once analysed. */
    whiteAccuracy: real('white_accuracy'),
    blackAccuracy: real('black_accuracy'),
    createdAt: createdAt(),
    startedAt: ts('started_at').notNull().defaultNow(),
    endedAt: ts('ended_at'),
  },
  (t) => [
    index('games_white_idx').on(t.whiteUserId, t.startedAt),
    index('games_black_idx').on(t.blackUserId, t.startedAt),
    index('games_status_idx').on(t.status),
  ],
);

export const moves = pgTable(
  'moves',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    /** 1-based half-move number. */
    ply: smallint('ply').notNull(),
    uci: text('uci').notNull(),
    san: text('san').notNull(),
    fenAfter: text('fen_after').notNull(),
    /** Clock of each side right after the move (increment included). */
    whiteMs: integer('white_ms'),
    blackMs: integer('black_ms'),
    /** Time the mover used. */
    spentMs: integer('spent_ms'),
    /** Engine analysis, filled later: centipawns from white's view, or mate in N. */
    evalCp: integer('eval_cp'),
    evalMate: smallint('eval_mate'),
    bestUci: text('best_uci'),
    classification: moveClassification('classification'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.ply] })],
);

/**
 * Finished engine reviews (every move graded, accuracy per side), stored so
 * opening a game review is a lookup instead of a fresh Stockfish run. Keyed by
 * content (start position + moves), so a review of the same moves is shared
 * whether it came from an online game, a computer game or the analysis board.
 */
export const gameReviews = pgTable(
  'game_reviews',
  {
    /** sha256 of "<initial fen>|<uci moves>". */
    key: text('key').primaryKey(),
    /** The online game it was made for, when there is one (not a foreign key: guest games may not be stored). */
    gameId: text('game_id'),
    /** The GameReview from @chessmate/core, as JSON. */
    review: jsonb('review').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('game_reviews_game_idx').on(t.gameId)],
);

// ---------------------------------------------------------------- social

/**
 * One row per ordered pair. A request is (requester -> addressee, pending);
 * accepting flips it to accepted. "blocked" rows are made by the blocker.
 */
export const friendships = pgTable(
  'friendships',
  {
    requesterId: text('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: text('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendshipStatus('status').notNull().default('pending'),
    createdAt: createdAt(),
    respondedAt: ts('responded_at'),
  },
  (t) => [
    primaryKey({ columns: [t.requesterId, t.addresseeId] }),
    index('friendships_addressee_idx').on(t.addresseeId, t.status),
    check('friendships_not_self', sql`${t.requesterId} <> ${t.addresseeId}`),
  ],
);

/** One-way follows: see someone's games in your feed and their presence, without a friendship. */
export const follows = pgTable(
  'follows',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: text('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index('follows_followee_idx').on(t.followeeId),
    check('follows_not_self', sql`${t.followerId} <> ${t.followeeId}`),
  ],
);

/**
 * Activity feed events. `actor` did something involving `subject`:
 * "game" (white vs black, payload has result), "friendship" (accepter, requester),
 * "follow" (follower, followee).
 */
export const activity = pgTable(
  'activity',
  {
    id: id(),
    kind: text('kind').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id').references(() => users.id, { onDelete: 'cascade' }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('activity_actor_idx').on(t.actorId, t.createdAt), index('activity_subject_idx').on(t.subjectId, t.createdAt)],
);

/**
 * In-app notifications (apps/server/src/notifications). The server keeps the
 * recent ones in memory and writes every change here, so the inbox survives
 * restarts and deploys. Notifications with the same collapse key replace each
 * other while unread.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** NotificationKind from @chessmate/core, e.g. "friend_request", "your_turn", "system". */
    kind: text('type').notNull(),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    /** In-app route opened when tapped. */
    url: text('url'),
    /** Kind-specific payload (ids, names) for rendering and deep links. */
    data: jsonb('data').$type<Record<string, string>>().notNull().default({}),
    collapseKey: text('collapse_key'),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt), index('notifications_user_created_idx').on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------- puzzles

export const puzzles = pgTable(
  'puzzles',
  {
    id: id(),
    /** Position before the opponent's setup move. */
    fen: text('fen').notNull(),
    /** UCI moves: the first is the opponent's move, then alternating solution moves. */
    moves: text('moves').array().notNull(),
    rating: real('rating').notNull().default(1500),
    rd: real('rd').notNull().default(350),
    themes: text('themes').array().notNull().default(sql`'{}'::text[]`),
    /** Where it came from, e.g. "lichess" (CC0 database) or "generated". */
    source: text('source'),
    sourceId: text('source_id'),
    plays: integer('plays').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('puzzles_rating_idx').on(t.rating),
    uniqueIndex('puzzles_source_idx').on(t.source, t.sourceId),
  ],
);

export const puzzleAttempts = pgTable(
  'puzzle_attempts',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    puzzleId: text('puzzle_id')
      .notNull()
      .references(() => puzzles.id, { onDelete: 'cascade' }),
    solved: boolean('solved').notNull(),
    timeMs: integer('time_ms'),
    /** Rated attempts move the user's "puzzle" rating. */
    rated: boolean('rated').notNull().default(true),
    ratingBefore: real('rating_before'),
    ratingAfter: real('rating_after'),
    createdAt: createdAt(),
  },
  (t) => [index('puzzle_attempts_user_idx').on(t.userId, t.createdAt), index('puzzle_attempts_puzzle_idx').on(t.puzzleId)],
);

// ---------------------------------------------------------------- administration

/**
 * Every staff action, append-only. Actor and target names are copied so the
 * log stays readable after renames or deletions (no foreign keys on purpose).
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: id(),
    /** User id of the staff member, or "system" for automatic actions. */
    actorId: text('actor_id').notNull(),
    actorName: text('actor_name').notNull(),
    /** e.g. "account.close", "chat.mute", "rating.adjust", "fairplay.dismiss". */
    action: text('action').notNull(),
    /** "user", "report", "game" or "case". */
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    targetName: text('target_name'),
    reason: text('reason'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('admin_audit_created_idx').on(t.createdAt),
    index('admin_audit_target_idx').on(t.targetId, t.createdAt),
    index('admin_audit_actor_idx').on(t.actorId, t.createdAt),
  ],
);

/** Formal warnings a player has received; shown to staff as their record. */
export const playerWarnings = pgTable(
  'player_warnings',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Same categories as player reports (abusive_chat, unsporting...). */
    category: text('category').notNull(),
    message: text('message').notNull(),
    issuedBy: text('issued_by').notNull(),
    issuedByName: text('issued_by_name').notNull(),
    reportId: text('report_id'),
    createdAt: createdAt(),
  },
  (t) => [index('player_warnings_user_idx').on(t.userId, t.createdAt)],
);

/** Player reports (chat abuse, cheating...) with the evidence captured at report time. */
export const moderationReports = pgTable(
  'moderation_reports',
  {
    id: text('id').primaryKey(),
    targetId: text('target_id').notNull(),
    reporterId: text('reporter_id').notNull(),
    status: text('status').notNull(),
    /** The whole report as the moderation module sees it (chat, moves, resolution). */
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('moderation_reports_status_idx').on(t.status, t.createdAt), index('moderation_reports_target_idx').on(t.targetId)],
);

/** Active chat mutes. */
export const chatBans = pgTable('chat_bans', {
  playerId: text('player_id').primaryKey(),
  until: ts('until').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
});

/**
 * Fair-play data (engine reports, cases, bans, rated-game deltas for refunds,
 * case log), one JSON document per row so the service's shapes can evolve
 * without migrations. Loaded into memory at boot and written through.
 */
export const fairPlayRecords = pgTable(
  'fair_play_records',
  {
    /** report | case | ban | game | log */
    kind: text('kind').notNull(),
    /** Unique within a kind: player id for cases and bans, game id for games, a random id otherwise. */
    key: text('key').notNull(),
    playerId: text('player_id'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.key] }), index('fair_play_player_idx').on(t.playerId)],
);

/** A player's request for a verified title, with the proof they attached. */
export const titleApplications = pgTable(
  'title_applications',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    fullName: text('full_name').notNull(),
    fideId: text('fide_id'),
    federation: text('federation'),
    note: text('note'),
    /** pending | approved | rejected | withdrawn */
    status: text('status').notNull().default('pending'),
    reviewedBy: text('reviewed_by'),
    reviewedByName: text('reviewed_by_name'),
    reviewNote: text('review_note'),
    reviewedAt: ts('reviewed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('title_app_user_idx').on(t.userId, t.createdAt), index('title_app_status_idx').on(t.status, t.createdAt)],
);

/** Certificates and letters attached to a title application. Kept in the database so a single server needs no file storage. */
export const titleDocuments = pgTable(
  'title_documents',
  {
    id: id(),
    applicationId: text('application_id')
      .notNull()
      .references(() => titleApplications.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    data: bytea('data').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('title_doc_app_idx').on(t.applicationId)],
);

// ---------------------------------------------------------------- row types

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type TitleApplicationRow = typeof titleApplications.$inferSelect;
export type TitleDocumentRow = typeof titleDocuments.$inferSelect;
export type RefreshSession = typeof refreshSessions.$inferSelect;
export type NewRefreshSession = typeof refreshSessions.$inferInsert;
export type PasswordReset = typeof passwordResets.$inferSelect;
export type RatingRow = typeof ratings.$inferSelect;
export type RatingCategory = (typeof ratingCategory.enumValues)[number];
export type GameRow = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type MoveRow = typeof moves.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Follow = typeof follows.$inferSelect;
export type ActivityRow = typeof activity.$inferSelect;
export type Puzzle = typeof puzzles.$inferSelect;
export type PuzzleAttempt = typeof puzzleAttempts.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
export type AdminAuditRow = typeof adminAuditLog.$inferSelect;
export type PlayerWarningRow = typeof playerWarnings.$inferSelect;

// ---------------------------------------------------------------- messages

/**
 * Direct messages between players, plus messages from ChessMate staff
 * (`kind` 'staff') and announcements to everyone (`kind` 'broadcast', one row
 * per recipient so read state stays per player). Game chat is separate.
 */
export const directMessages = pgTable(
  'direct_messages',
  {
    id: id(),
    senderId: text('sender_id').notNull(),
    recipientId: text('recipient_id').notNull(),
    body: text('body').notNull(),
    /** user | staff | broadcast */
    kind: text('kind').notNull().default('user'),
    createdAt: createdAt(),
    readAt: ts('read_at'),
  },
  (t) => [index('direct_messages_recipient_idx').on(t.recipientId, t.createdAt), index('direct_messages_sender_idx').on(t.senderId, t.createdAt)],
);

// ---------------------------------------------------------------- tournaments

/** Arena tournaments created by staff. Players join; the server pairs them while it runs. */
export const tournaments = pgTable(
  'tournaments',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    /** scheduled | running | finished | cancelled */
    status: text('status').notNull(),
    initialMs: integer('initial_ms').notNull(),
    incrementMs: integer('increment_ms').notNull(),
    rated: boolean('rated').notNull().default(true),
    startsAt: ts('starts_at').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    maxPlayers: integer('max_players'),
    /** Free text shown as the prize pool ("$500", "ChessMate Premium for a year"). */
    prizePool: text('prize_pool'),
    /** Prize per place: [{ place: 1, prize: '$250' }, ...]. */
    prizes: jsonb('prizes').$type<{ place: number; prize: string }[]>().notNull().default([]),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
    finishedAt: ts('finished_at'),
    /** Entry fee in the smallest currency unit (cents); 0 = free. Paid through Stripe on the web. */
    entryFeeCents: integer('entry_fee_cents').notNull().default(0),
    currency: text('currency').notNull().default('eur'),
    minRating: integer('min_rating'),
    maxRating: integer('max_rating'),
    /** Rated games a player must have played in this speed to join. */
    minRatedGames: integer('min_rated_games').notNull().default(0),
    /** May players join after the start? */
    lateJoin: boolean('late_join').notNull().default(true),
    /** Extra rules players accept when joining (shown with the standard arena rules). */
    rules: text('rules'),
    sponsorName: text('sponsor_name'),
    sponsorUrl: text('sponsor_url'),
    /** Logo as a data URL (PNG/JPEG/WebP, at most ~300 KB), served at /api/tournaments/:id/logo. */
    sponsorLogo: text('sponsor_logo'),
    /** Format, rounds, end mode and arena scoring options (core `TournamentSettings`); {} = defaults. */
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    /** Swiss: the round being played (0 before the first). */
    currentRound: integer('current_round').notNull().default(0),
  },
  (t) => [index('tournaments_starts_idx').on(t.startsAt)],
);

export interface TournamentPlayerState {
  drawRun?: number;
  lossRun?: number;
  opponents?: string[];
  colors?: ('w' | 'b')[];
  byes?: number;
}

export const tournamentPlayers = pgTable(
  'tournament_players',
  {
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    rating: integer('rating').notNull(),
    score: integer('score').notNull().default(0),
    games: integer('games').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    /** Consecutive wins; from the third in a row a win counts double. */
    streak: integer('streak').notNull().default(0),
    withdrawn: boolean('withdrawn').notNull().default(false),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /** Removed by staff; cannot rejoin. */
    disqualified: boolean('disqualified').notNull().default(false),
    /** Entry fee paid (paid tournaments only). */
    paid: boolean('paid').notNull().default(false),
    rulesAcceptedAt: ts('rules_accepted_at'),
    /** Draw and loss runs (arena streak options) and Swiss history: opponents, colours, byes. */
    state: jsonb('state').$type<TournamentPlayerState>().notNull().default({}),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.userId] })],
);

/**
 * Every game a tournament started, with its result once it ends. `counted`
 * says whether it scored (aborted games and games cut off by the timer do not).
 */
export const tournamentGames = pgTable(
  'tournament_games',
  {
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    gameId: text('game_id').notNull(),
    /** Swiss round (null in arenas). */
    round: integer('round'),
    whiteId: text('white_id').notNull(),
    blackId: text('black_id').notNull(),
    whiteName: text('white_name').notNull(),
    blackName: text('black_name').notNull(),
    /** 1-0 | 0-1 | 1/2-1/2 | * (still playing) */
    result: text('result').notNull().default('*'),
    endReason: text('end_reason'),
    counted: boolean('counted').notNull().default(false),
    /** Tournament points each side scored (as stored: Swiss points are doubled). */
    whitePoints: integer('white_points').notNull().default(0),
    blackPoints: integer('black_points').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: ts('ended_at'),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.gameId] }), index('tournament_games_started_idx').on(t.tournamentId, t.startedAt)],
);

/** Tournament chat. Staff can hide a message; hidden messages stay for staff to read. */
export const tournamentMessages = pgTable(
  'tournament_messages',
  {
    id: id(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    body: text('body').notNull(),
    /** Posted by staff from the admin view. */
    staff: boolean('staff').notNull().default(false),
    /** The profanity filter changed the text. */
    filtered: boolean('filtered').notNull().default(false),
    createdAt: createdAt(),
    hiddenAt: ts('hidden_at'),
    hiddenBy: text('hidden_by'),
  },
  (t) => [index('tournament_messages_tournament_idx').on(t.tournamentId, t.createdAt)],
);

/** Stripe Checkout payments for tournament entry fees. */
export const tournamentPayments = pgTable(
  'tournament_payments',
  {
    id: id(),
    tournamentId: text('tournament_id').notNull(),
    userId: text('user_id').notNull(),
    stripeSessionId: text('stripe_session_id').notNull().unique(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    /** pending | paid | expired | refunded */
    status: text('status').notNull().default('pending'),
    createdAt: createdAt(),
    paidAt: ts('paid_at'),
  },
  (t) => [index('tournament_payments_player_idx').on(t.tournamentId, t.userId)],
);

/** "Sponsor a tournament" applications; staff review them and get in touch. */
export const sponsorApplications = pgTable('sponsor_applications', {
  id: id(),
  userId: text('user_id'),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company'),
  website: text('website'),
  budget: text('budget'),
  message: text('message').notNull(),
  /** new | contacted | accepted | declined */
  status: text('status').notNull().default('new'),
  staffNote: text('staff_note'),
  reviewedBy: text('reviewed_by'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at'),
});

/** Prize winners asking to be paid; staff review them and get in touch. */
export const payoutRequests = pgTable(
  'payout_requests',
  {
    id: id(),
    tournamentId: text('tournament_id').notNull(),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    place: integer('place').notNull(),
    prize: text('prize').notNull(),
    /** paypal | bank | other */
    method: text('method').notNull(),
    details: text('details').notNull(),
    note: text('note'),
    /** new | contacted | paid | rejected */
    status: text('status').notNull().default('new'),
    staffNote: text('staff_note'),
    reviewedBy: text('reviewed_by'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at'),
  },
  (t) => [uniqueIndex('payout_requests_player_idx').on(t.tournamentId, t.userId)],
);

export type DirectMessage = typeof directMessages.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type TournamentPlayer = typeof tournamentPlayers.$inferSelect;
export type TournamentPayment = typeof tournamentPayments.$inferSelect;
export type TournamentGame = typeof tournamentGames.$inferSelect;
export type TournamentMessage = typeof tournamentMessages.$inferSelect;
export type SponsorApplication = typeof sponsorApplications.$inferSelect;
export type PayoutRequest = typeof payoutRequests.$inferSelect;

// ---------------------------------------------------------------- community: news and forum

/** News posts written by staff. Players like and comment. */
export const newsPosts = pgTable(
  'news_posts',
  {
    id: id(),
    authorId: text('author_id').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Picture (data URL), served at /api/news/:id/image. */
    image: text('image'),
    links: jsonb('links').$type<{ label: string; url: string }[]>().notNull().default([]),
    pinned: boolean('pinned').notNull().default(false),
    likeCount: integer('like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts('updated_at'),
    deletedAt: ts('deleted_at'),
  },
  (t) => [index('news_posts_created_idx').on(t.createdAt)],
);

export const newsLikes = pgTable(
  'news_likes',
  {
    postId: text('post_id')
      .notNull()
      .references(() => newsPosts.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const newsComments = pgTable(
  'news_comments',
  {
    id: id(),
    postId: text('post_id')
      .notNull()
      .references(() => newsPosts.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [index('news_comments_post_idx').on(t.postId, t.createdAt)],
);

/** Forum topics started by players; staff can pin, lock and remove them. */
export const forumTopics = pgTable(
  'forum_topics',
  {
    id: id(),
    userId: text('user_id').notNull(),
    category: text('category').notNull().default('general'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    locked: boolean('locked').notNull().default(false),
    replyCount: integer('reply_count').notNull().default(0),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [index('forum_topics_activity_idx').on(t.lastActivityAt)],
);

export const forumReplies = pgTable(
  'forum_replies',
  {
    id: id(),
    topicId: text('topic_id')
      .notNull()
      .references(() => forumTopics.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [index('forum_replies_topic_idx').on(t.topicId, t.createdAt)],
);

export type NewsPost = typeof newsPosts.$inferSelect;
export type NewsComment = typeof newsComments.$inferSelect;
export type ForumTopic = typeof forumTopics.$inferSelect;
export type ForumReply = typeof forumReplies.$inferSelect;

// ---------------------------------------------------------------- play habits: limits and streaks

/**
 * Per player: the self-chosen play limit (anti-addiction) and the daily streak.
 * The server enforces the limit: while `lockedUntil` is in the future no game
 * can be started, and the limit cannot be loosened or switched off.
 */
export const playHabits = pgTable('play_habits', {
  userId: text('user_id').primaryKey(),
  limitsEnabled: boolean('limits_enabled').notNull().default(false),
  maxGames: integer('max_games').notNull().default(5),
  windowMinutes: integer('window_minutes').notNull().default(60),
  cooldownMinutes: integer('cooldown_minutes').notNull().default(60),
  lockedUntil: ts('locked_until'),
  /** End times (ms) of games inside the current window. */
  recentGames: jsonb('recent_games').$type<number[]>().notNull().default([]),
  streakStart: ts('streak_start'),
  lastPlayedAt: ts('last_played_at'),
  bestStreak: integer('best_streak').notNull().default(0),
  /** Minutes east of UTC, from the player's device: streak days follow their calendar. */
  tzOffsetMin: integer('tz_offset_min').notNull().default(0),
  lastComputerGameAt: ts('last_computer_game_at'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PlayHabits = typeof playHabits.$inferSelect;

/**
 * Award counters per player (core `AwardStats`), updated after every finished
 * game. Built from the player's game history the first time it is needed.
 */
export const awardStats = pgTable('award_stats', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  stats: jsonb('stats').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Award levels earned, with when and in which game. */
export const userAwards = pgTable(
  'user_awards',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    awardId: text('award_id').notNull(),
    level: smallint('level').notNull(),
    gameId: text('game_id'),
    earnedAt: ts('earned_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.awardId, t.level] }), index('user_awards_recent_idx').on(t.userId, t.earnedAt)],
);
export type UserAward = typeof userAwards.$inferSelect;

/** Server-wide switches staff can change (key → JSON value). */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Approved streamers: their channels and whether they are live now. */
export const streamers = pgTable('streamers', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  headline: text('headline').notNull().default(''),
  channels: jsonb('channels').$type<{ platform: string; url: string }[]>().notNull().default([]),
  liveTitle: text('live_title'),
  liveUrl: text('live_url'),
  liveSince: ts('live_since'),
  /** Viewers watching now, as the platform reports it (detected streams). */
  liveViewers: integer('live_viewers'),
  /** Preview picture of the stream. */
  liveThumbnail: text('live_thumbnail'),
  /** What a player embeds: "twitch:<channel>", "youtube:<video id>" or "kick:<channel>". */
  liveEmbed: text('live_embed'),
  /** True when ChessMate found the stream itself (it also ends it when the stream stops). */
  liveAuto: boolean('live_auto').notNull().default(false),
  approvedAt: ts('approved_at').notNull().defaultNow(),
});

/** Requests to become a streamer. */
export const streamerApplications = pgTable(
  'streamer_applications',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channels: jsonb('channels').$type<{ platform: string; url: string }[]>().notNull(),
    about: text('about').notNull(),
    status: text('status').notNull().default('pending'),
    note: text('note'),
    reviewedBy: text('reviewed_by'),
    createdAt: createdAt(),
    reviewedAt: ts('reviewed_at'),
  },
  (t) => [index('streamer_applications_user_idx').on(t.userId), index('streamer_applications_status_idx').on(t.status)],
);

/** Chess events ChessMate broadcasts (created by staff or organisers, or imported). */
export const broadcastEvents = pgTable(
  'broadcast_events',
  {
    id: id(),
    name: text('name').notNull(),
    shortDescription: text('short_description').notNull().default(''),
    description: text('description').notNull().default(''),
    location: text('location').notNull().default(''),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
    format: text('format').notNull().default('other'),
    timeControl: text('time_control').notNull().default(''),
    website: text('website'),
    /** Data URL, served at /api/events/:id/logo. */
    logo: text('logo'),
    /** Cover picture (data URL), served at /api/watch/events/:id/cover. */
    cover: text('cover'),
    links: jsonb('links').$type<{ label: string; url: string }[]>().notNull().default([]),
    published: boolean('published').notNull().default(false),
    featured: boolean('featured').notNull().default(false),
    hidden: boolean('hidden').notNull().default(false),
    source: text('source').notNull().default('chessmate'),
    /** Id at the source (Lichess tournament id) for imported events. */
    externalId: text('external_id'),
    sourceUrl: text('source_url'),
    createdBy: text('created_by'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    /** When the event was first seen finished; the event and its chat are deleted a day later. */
    finishedAt: ts('finished_at'),
  },
  (t) => [index('broadcast_events_starts_idx').on(t.startsAt), uniqueIndex('broadcast_events_external_idx').on(t.source, t.externalId)],
);

/** Live chat on a broadcast event's page. Deleted with the event. */
export const broadcastMessages = pgTable(
  'broadcast_messages',
  {
    id: id(),
    eventId: text('event_id')
      .notNull()
      .references(() => broadcastEvents.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    username: text('username').notNull(),
    body: text('body').notNull(),
    /** Posted by ChessMate staff or one of the event's organisers. */
    staff: boolean('staff').notNull().default(false),
    /** The profanity filter changed the text. */
    filtered: boolean('filtered').notNull().default(false),
    createdAt: createdAt(),
    hiddenAt: ts('hidden_at'),
    hiddenBy: text('hidden_by'),
  },
  (t) => [index('broadcast_messages_event_idx').on(t.eventId, t.createdAt)],
);

/** Organisers allowed to manage one event. */
export const broadcastOrganizers = pgTable(
  'broadcast_organizers',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => broadcastEvents.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addedBy: text('added_by'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] }), index('broadcast_organizers_user_idx').on(t.userId)],
);

export const broadcastPlayers = pgTable(
  'broadcast_players',
  {
    id: id(),
    eventId: text('event_id')
      .notNull()
      .references(() => broadcastEvents.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    title: text('title'),
    rating: integer('rating'),
    federation: text('federation'),
    fideId: text('fide_id'),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('broadcast_players_event_idx').on(t.eventId)],
);

export const broadcastRounds = pgTable(
  'broadcast_rounds',
  {
    id: id(),
    eventId: text('event_id')
      .notNull()
      .references(() => broadcastEvents.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    name: text('name').notNull(),
    startsAt: ts('starts_at'),
    /** manual | pgnUrl | lichess */
    sourceKind: text('source_kind').notNull().default('manual'),
    sourceUrl: text('source_url'),
    lichessRoundId: text('lichess_round_id'),
    /** Lichess says the round is over: stop polling it. */
    sourceFinished: boolean('source_finished').notNull().default(false),
    lastSyncAt: ts('last_sync_at'),
    syncError: text('sync_error'),
    createdAt: createdAt(),
  },
  (t) => [index('broadcast_rounds_event_idx').on(t.eventId)],
);

/** One analysed position of a broadcast game. */
export interface BroadcastEvalEntry {
  /** Position key (first four FEN fields), to notice when the moves changed. */
  f: string;
  /** Score, White's view. */
  s: { cp?: number; mate?: number };
  /** Best move (UCI) and the start of the best line. */
  b?: string;
  pv?: string[];
  d: number;
  /** Second-best score (White's view), to spot only moves. */
  s2?: { cp?: number; mate?: number };
}

export const broadcastGames = pgTable(
  'broadcast_games',
  {
    id: id(),
    roundId: text('round_id')
      .notNull()
      .references(() => broadcastRounds.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => broadcastEvents.id, { onDelete: 'cascade' }),
    board: integer('board').notNull(),
    whiteName: text('white_name').notNull(),
    blackName: text('black_name').notNull(),
    whiteTitle: text('white_title'),
    blackTitle: text('black_title'),
    whiteRating: integer('white_rating'),
    blackRating: integer('black_rating'),
    whiteFed: text('white_fed'),
    blackFed: text('black_fed'),
    whitePlayerId: text('white_player_id'),
    blackPlayerId: text('black_player_id'),
    result: text('result').notNull().default('*'),
    initialFen: text('initial_fen').notNull(),
    moves: jsonb('moves').$type<string[]>().notNull().default([]),
    clocks: jsonb('clocks').$type<(number | null)[]>().notNull().default([]),
    /** Summary for lists, so they need not read the moves. */
    fen: text('fen').notNull(),
    ply: integer('ply').notNull().default(0),
    lastMove: text('last_move'),
    whiteClockMs: integer('white_clock_ms'),
    blackClockMs: integer('black_clock_ms'),
    clockAt: ts('clock_at'),
    /** Engine evaluation of each position (index = plies played), filled in live. */
    evals: jsonb('evals').$type<(BroadcastEvalEntry | null)[]>().notNull().default([]),
    /** Move grades (core MoveClass) for the moves analysed so far, index = ply - 1. */
    grades: jsonb('grades').$type<(string | null)[]>().notNull().default([]),
    /** Summary for lists: evaluation of the latest position and the last move's grade. */
    evalScore: jsonb('eval_score').$type<{ cp?: number; mate?: number } | null>(),
    lastGrade: text('last_grade'),
    /** How the game ended (checkmate, resign, timeout, …), worked out when it finishes. */
    ending: text('ending'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('broadcast_games_round_board_idx').on(t.roundId, t.board), index('broadcast_games_event_idx').on(t.eventId)],
);

export const broadcastNews = pgTable(
  'broadcast_news',
  {
    id: id(),
    eventId: text('event_id')
      .notNull()
      .references(() => broadcastEvents.id, { onDelete: 'cascade' }),
    authorId: text('author_id'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Picture (data URL), served at /api/watch/news/:id/image. */
    image: text('image'),
    links: jsonb('links').$type<{ label: string; url: string }[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index('broadcast_news_event_idx').on(t.eventId, t.createdAt)],
);

/** Requests to broadcast an event on ChessMate. */
export const broadcastApplications = pgTable(
  'broadcast_applications',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventName: text('event_name').notNull(),
    organization: text('organization').notNull(),
    website: text('website'),
    location: text('location').notNull(),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
    description: text('description').notNull(),
    coverage: text('coverage').notNull().default(''),
    status: text('status').notNull().default('pending'),
    note: text('note'),
    eventId: text('event_id'),
    reviewedBy: text('reviewed_by'),
    createdAt: createdAt(),
    reviewedAt: ts('reviewed_at'),
  },
  (t) => [index('broadcast_applications_user_idx').on(t.userId), index('broadcast_applications_status_idx').on(t.status)],
);

export type BroadcastEventRow = typeof broadcastEvents.$inferSelect;
export type BroadcastPlayerRow = typeof broadcastPlayers.$inferSelect;
export type BroadcastRoundRow = typeof broadcastRounds.$inferSelect;
export type BroadcastGameRow = typeof broadcastGames.$inferSelect;
export type BroadcastNewsRow = typeof broadcastNews.$inferSelect;
export type BroadcastMessageRow = typeof broadcastMessages.$inferSelect;
export type BroadcastApplicationRow = typeof broadcastApplications.$inferSelect;
export type StreamerRow = typeof streamers.$inferSelect;
export type StreamerApplicationRow = typeof streamerApplications.$inferSelect;

// ---------------------------------------------------------------- profile settings

/**
 * Profile fields and settings owned by the profile module (apps/server/src/profiles),
 * one row per account. Settings are the whole UserSettings object from @chessmate/core;
 * missing keys are filled from defaults when read, so new settings need no migration.
 */
export const userProfiles = pgTable('user_profiles', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name'),
  bio: text('bio'),
  country: text('country'),
  avatar: jsonb('avatar').notNull(),
  /** Tag the player picked for themselves (PLAYER_TAGS in @chessmate/core). */
  playerTag: text('player_tag'),
  /** Football Mate: the club they support (FOOTBALL_CLUBS id in @chessmate/core). */
  footballClub: text('football_club'),
  settings: jsonb('settings').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export type UserProfileRow = typeof userProfiles.$inferSelect;

// ---------------------------------------------------------------- notifications

/** Notification preferences per account (the whole NotificationPrefs object from @chessmate/core). */
export const notificationPrefs = pgTable('notification_prefs', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  prefs: jsonb('prefs').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Expo push tokens: one row per device, moved to whichever account last registered it. */
export const pushTokens = pgTable(
  'push_tokens',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [index('push_tokens_user_idx').on(t.userId)],
);

export type NotificationPrefsRow = typeof notificationPrefs.$inferSelect;
export type PushTokenDbRow = typeof pushTokens.$inferSelect;

// ---------------------------------------------------------------- lessons

/** Learn-tab chapters, in `position` order. */
export const lessonChapters = pgTable('lesson_chapters', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  blurb: text('blurb').notNull().default(''),
  position: integer('position').notNull().default(0),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/**
 * Learn-tab lessons. `data` is the whole Lesson from @chessmate/core (title,
 * steps with their positions and puzzles, links), checked by the server before
 * it is saved. Unpublished lessons are drafts only staff see.
 */
export const lessons = pgTable(
  'lessons',
  {
    id: text('id').primaryKey(),
    chapterId: text('chapter_id')
      .notNull()
      .references(() => lessonChapters.id, { onDelete: 'restrict' }),
    position: integer('position').notNull().default(0),
    published: boolean('published').notNull().default(true),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    updatedBy: text('updated_by'),
  },
  (t) => [index('lessons_chapter_idx').on(t.chapterId, t.position)],
);

export type LessonChapterRow = typeof lessonChapters.$inferSelect;
export type LessonRow = typeof lessons.$inferSelect;

// ---------------------------------------------------------------- push campaigns

/**
 * Notifications staff send from the console: right away, at a set time, or
 * as a trigger on what players do. `message`, `audience`, `trigger` and
 * `stats` are the shapes of the same names in @chessmate/core (campaigns.ts).
 */
export const pushCampaigns = pgTable(
  'push_campaigns',
  {
    id: id(),
    name: text('name').notNull(),
    /** instant | scheduled | trigger */
    kind: text('kind').notNull(),
    /** draft | scheduled | sending | sent | active | paused | cancelled | failed */
    status: text('status').notNull(),
    message: jsonb('message').$type<Record<string, unknown>>().notNull(),
    audience: jsonb('audience').$type<Record<string, unknown>>().notNull(),
    trigger: jsonb('trigger').$type<Record<string, unknown>>(),
    scheduleAt: ts('schedule_at'),
    stats: jsonb('stats').$type<Record<string, number>>().notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    sentAt: ts('sent_at'),
    lastError: text('last_error'),
  },
  (t) => [index('push_campaigns_status_idx').on(t.status)],
);

/** One row per player a campaign reached: frequency caps, trigger cooldowns and "already sent" checks. */
export const pushCampaignDeliveries = pgTable(
  'push_campaign_deliveries',
  {
    id: id(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => pushCampaigns.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [index('push_campaign_deliveries_campaign_idx').on(t.campaignId, t.userId), index('push_campaign_deliveries_user_idx').on(t.userId, t.createdAt)],
);

/** Trigger sends waiting for their delay ("left without playing" 30 minutes later); kept so a deploy does not drop them. */
export const pushTriggerJobs = pgTable(
  'push_trigger_jobs',
  {
    campaignId: text('campaign_id')
      .notNull()
      .references(() => pushCampaigns.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dueAt: ts('due_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] }), index('push_trigger_jobs_due_idx').on(t.dueAt)],
);

export type PushCampaignRow = typeof pushCampaigns.$inferSelect;
export type PushTriggerJobRow = typeof pushTriggerJobs.$inferSelect;
