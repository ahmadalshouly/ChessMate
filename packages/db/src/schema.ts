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

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** e.g. "friend_request", "friend_accepted", "challenge", "game_over". */
    type: text('type').notNull(),
    /** Type-specific payload (ids, names) for rendering and deep links. */
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt)],
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
