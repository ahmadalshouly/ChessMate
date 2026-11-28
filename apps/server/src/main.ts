import { DEFAULT_SETTINGS, isStaff } from '@chessmate/core';
import { DEFAULT_PGLITE_DIR, abortStaleGames, ensureUser, openDb, setUserAvatarUrl, type Database } from '@chessmate/db';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { AdminService, DbModerationStore } from './admin';
import { blobStoreFromEnv } from './avatars/storage';
import { DbFairPlayStore } from './fairplay';
import { AuthService, DbAuthStore, mailerFromEnv, MemoryAuthStore, OAuthVerifier, authRoutes, oauthConfigFromEnv, type AuthStore } from './auth';
import { createAnalysisService } from './engine';
import { DbLeaderboardSource, Leaderboards } from './leaderboard';
import { CampaignService } from './notifications/campaigns';
import { DbNotificationStore } from './notifications/dbStore';
import { DbGamePersistence, DbPlayerStore, loadRatingsInto } from './persistence';
import { AccountProfileBackend, DbProfileStore, DevProfileBackend, MemoryProfileStore, dbGamesOf, profileRoutes, type FinishedGame } from './profiles';
import { PuzzleApi } from './puzzles/api';
import { lessonRoutes } from './lessons/http';
import { LessonService, builtinLessonCatalog } from './lessons/service';
import { loadBundledPuzzles, openPuzzleStore } from './puzzles/setup';
import { Moderation } from './moderation';
import { MemoryRatingRepository, RatingService } from './ratingService';
import { ChessServer, devResolveUser, type ServerOptions } from './server';
import { SocialService } from './social/service';
import { CommunityService } from './community/service';
import { AwardsService } from './awards/service';
import { EventService } from './watch/events';
import { StreamerService } from './watch/streamers';
import { LiveChecker, liveCheckConfigFromEnv } from './watch/live';
import { BroadcastAnalyzer } from './watch/analysis';
import { BroadcastSync } from './watch/sync';
import { PlayHabitsService } from './habits/service';
import { CollectionsService } from './collections/service';
import { MessageService } from './messages/service';
import { TournamentService } from './tournaments/service';
import { AdService } from './ads/service';
import { BotService } from './bots/service';
import { AnalyticsService, analyticsRoutes } from './analytics';
import { stripeFromEnv } from './payments/stripe';
import { gameRoutes } from './games/http';
import { DonationLedger, donateRoutes } from './payments/donate';
import { stripeWebhookRoute } from './payments/webhook';
import { SponsorDesk } from './sponsors/service';
import { sponsorshipRoutes } from './sponsors/http';
import { tournamentStripeHandler } from './tournaments/http';
import { ExplorerService, LichessExplorer, explorerRoutes } from './explorer';

const port = Number(process.env.PORT ?? 8787);
const production = process.env.NODE_ENV === 'production';

/**
 * Token signing secret. Production must set AUTH_SECRET. In development a
 * secret is generated once and kept in .data/auth-secret, so sign-ins survive
 * server restarts.
 */
function authSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (production) throw new Error('AUTH_SECRET must be set in production');
  const file = join(dirname(process.env.DATABASE_PATH ?? DEFAULT_PGLITE_DIR), 'auth-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

// The engine serves the analysis board, broadcasts, and game reviews for devices that can't run their own engine.
const { service: analysis, engine } = createAnalysisService(process.env);
const puzzleStore = await openPuzzleStore();
const puzzles = new PuzzleApi({ store: puzzleStore });
// Learn-tab lessons: from the database once it is open (staff edit them in the console), the built-in set until then.
let lessonCatalog = builtinLessonCatalog;
// Ratings are read from memory during play and written to the database after
// every rated game (DbGamePersistence). The cache is warmed from the database on
// startup so a restart never resets anyone to 1500.
const ratingRepo = new MemoryRatingRepository();
const ratings = new RatingService(ratingRepo);
// Dig Deep (opening explorer): the Lichess databases through our own cache, plus ChessMate's own games.
// LICHESS_EXPLORER_URL points at a self-hosted lila-openingexplorer instead of Lichess's own.
const lichessExplorer = new LichessExplorer({
  token: process.env.LICHESS_TOKEN || undefined,
  origin: process.env.LICHESS_EXPLORER_URL || undefined,
  log: (msg) => console.warn(msg),
});
// Profile pictures: object storage (Tigris, R2, S3) when configured, so they survive deploys; local disk otherwise.
const blobs = blobStoreFromEnv(process.env, join(dirname(process.env.DATABASE_PATH ?? DEFAULT_PGLITE_DIR), 'uploads'));
console.log(`Profile pictures: ${blobs.description}`);
if (production && !blobs.description.startsWith('S3')) {
  console.warn('Profile pictures are on local disk and will be lost on redeploy: run `fly storage create` (or set BUCKET_NAME, AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
}

function services(
  authStore: AuthStore,
  gamesOf?: (userId: string, limit: number) => Promise<FinishedGame[]>,
  profileStore: MemoryProfileStore | DbProfileStore = new MemoryProfileStore(),
  db?: Database,
) {
  const auth = new AuthService({ store: authStore, mailer: mailerFromEnv(), secret: authSecret(), oauth: new OAuthVerifier(oauthConfigFromEnv()) });
  // Signed-in players get their own profile; dev tokens and the seeded demo players use the dev backend.
  const profileDeps = new AccountProfileBackend(auth, ratings, production ? null : new DevProfileBackend(), gamesOf);
  const profiles = profileRoutes(profileDeps, profileStore, Date.now, {
    blobs,
    // Friends lists, messages and search read the users row: keep its picture in step.
    onChange: db ? (userId, url) => setUserAvatarUrl(db, userId, url) : undefined,
  });
  const base: ServerOptions = {
    port,
    auth,
    ratings,
    analysis,
    http: [authRoutes(auth), profiles, (req, res) => puzzles.handle(req, res), lessonRoutes(() => lessonCatalog())],
    adminToken: process.env.ADMIN_TOKEN || undefined,
  };
  return { auth, base, profileDeps, profileStore };
}

// Postgres when DATABASE_URL is set, otherwise embedded Postgres in .data/pglite.
// CHESSMATE_DB=off runs fully in memory (nothing saved, no friends).
async function start() {
  if (process.env.CHESSMATE_DB === 'off') {
    console.log('Database disabled (CHESSMATE_DB=off): accounts and games are not saved, friends are off');
    const { base, profileDeps } = services(new MemoryAuthStore());
    base.http = [...(base.http ?? []), explorerRoutes(new ExplorerService({ lichess: lichessExplorer }))];
    const server = new ChessServer(base);
    profileDeps.online = (id) => server.isOnline(id);
    profileDeps.liveGame = (id) => server.liveGameOf(id);
    return { server, close: async () => {} };
  }
  const db = openDb();
  await db.migrate();
  const stale = await abortStaleGames(db.db);
  const stored = await loadRatingsInto(ratingRepo, db.db);
  console.log(`Database ready (${db.kind}: ${db.location})${stale ? `, closed ${stale} unfinished game(s)` : ''}, ${stored} rating(s) loaded`);
  // Profiles and settings (privacy included) live in the database, so they survive restarts.
  const { auth, base, profileDeps, profileStore } = services(new DbAuthStore(db.db), dbGamesOf(db.db), await DbProfileStore.load(db.db), db.db);
  const explorer = new ExplorerService({ db: db.db, lichess: lichessExplorer });
  const stripe = stripeFromEnv();
  const donations = new DonationLedger(db.db);
  base.http = [
    ...(base.http ?? []),
    donateRoutes(stripe, { ledger: donations, userOf: (token) => auth.verifyAccessToken(token)?.userId ?? null }),
    explorerRoutes(explorer),
    gameRoutes(db.db, {
      viewerOf: (token) => auth.verifyAccessToken(token)?.userId ?? null,
      gamesHidden: async (id) => !((await profileStore.get(id))?.settings.privacy.showGames ?? DEFAULT_SETTINGS.privacy.showGames),
      // Book grades in saved reviews also count masters theory, as the app's review does.
      theoryPlies: (initialFen, moves) => explorer.theoryPlies(initialFen, moves),
    }),
  ];
  // Staff console: roles and closed accounts load now; ADMIN_USERNAMES promotes those accounts to admin.
  const admin = new AdminService({ db: db.db, auth });
  await admin.load((process.env.ADMIN_USERNAMES ?? '').split(','));
  profileDeps.titles = admin.titles;
  const persistence = new DbGamePersistence(db.db);
  // Dig Deep's ChessMate collection: each finished game is counted once; older games are counted in the background.
  persistence.afterFinish = (g) => explorer.recordGame(g);
  setTimeout(
    () =>
      void explorer
        .backfill()
        .then((n) => n && console.log(`Dig Deep: counted ${n} earlier game(s) in the ChessMate collection`))
        .catch((e) => console.warn('Dig Deep backfill failed (tries again on the next start):', e)),
    30_000,
  ).unref();
  setInterval(() => void explorer.prune().catch((e) => console.warn('Dig Deep cache cleanup failed', e)), 24 * 3_600_000).unref();
  const store = await DbPlayerStore.load(db.db, persistence);
  const privacyOf = (id: string) => profileStore.get(id)?.settings.privacy ?? DEFAULT_SETTINGS.privacy;
  const messages = new MessageService({ db: db.db, privacyOf: (id) => privacyOf(id).messages, isStaff: (id) => isStaff(admin.roleOf(id)) });
  admin.messages = messages;
  const community = new CommunityService({ db: db.db, isStaff: (id) => isStaff(admin.roleOf(id)) });
  // Play limits and streaks; breaks in force are loaded so a restart can't lift them.
  const habits = new PlayHabitsService({ db: db.db });
  await habits.load();
  const awards = new AwardsService({ db: db.db });
  // Watch: streamers and broadcast events, kept in sync with live PGN sources and Lichess.
  const streamers = new StreamerService({ db: db.db, roleOf: (id) => admin.roleOf(id) });
  const events = new EventService({ db: db.db, roleOf: (id) => admin.roleOf(id) });
  await events.load();
  const broadcastSync = new BroadcastSync({ db: db.db, events });
  broadcastSync.start();
  // Shared engine analysis of broadcast games (low priority: players' analysis goes first).
  const broadcastAnalyzer = new BroadcastAnalyzer({ db: db.db, engine: analysis, onUpdate: (eventId) => events.invalidate(eventId) });
  broadcastAnalyzer.start();
  setInterval(() => void streamers.sweep().catch((e) => console.warn('streamer sweep failed', e)), 10 * 60_000).unref();
  // Finished events (with their chat) are deleted a day after they finish.
  const sweepEvents = () => void events.sweepFinished().catch((e) => console.warn('event cleanup failed', e));
  setTimeout(sweepEvents, 60_000).unref();
  setInterval(sweepEvents, 10 * 60_000).unref();
  // Live detection: streamers show as live (with viewers) when they stream, no button needed.
  const liveChecker = new LiveChecker(liveCheckConfigFromEnv(process.env));
  const livePlatforms = liveChecker.platforms();
  console.log(`Streamer live check: Twitch ${livePlatforms.twitch ? 'on' : 'off (set TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET)'}; YouTube ${livePlatforms.youtube === 'full' ? 'on with viewers' : 'on (viewers need YOUTUBE_API_KEY)'}; Kick ${livePlatforms.kick === 'full' ? 'on' : 'basic (set KICK_CLIENT_ID, KICK_CLIENT_SECRET)'}`);
  let liveBusy = false;
  const detectLive = () => {
    if (liveBusy) return;
    liveBusy = true;
    void streamers
      .detectLive(liveChecker)
      .catch((e) => console.warn('live check failed', e))
      .finally(() => (liveBusy = false));
  };
  setTimeout(detectLive, 15_000).unref();
  setInterval(detectLive, 60_000).unref();
  const tournaments = new TournamentService({ db: db.db, stripe });
  await tournaments.load();
  admin.tournaments = tournaments;
  // Sponsors: staff and the company talk on the company's own page, and staff send Stripe payment links there.
  const sponsorDesk = new SponsorDesk({
    db: db.db,
    stripe,
    sendEmail: auth.mailer.sendAccountNotice ? (to, notice) => auth.mailer.sendAccountNotice!(to, notice) : undefined,
    staffInbox: process.env.SPONSOR_INBOX_EMAIL || null,
  });
  tournaments.onSponsorApplication = (row) => sponsorDesk.welcome(row);
  admin.sponsorDesk = sponsorDesk;
  admin.donations = donations;
  // One Stripe webhook for every payment: sponsor links, donations, then tournament entry fees.
  base.http = [
    ...(base.http ?? []),
    stripeWebhookRoute([(e) => sponsorDesk.handleStripeEvent(e), (e) => donations.handleStripeEvent(e), tournamentStripeHandler(tournaments)]),
    sponsorshipRoutes(sponsorDesk, (token) => auth.verifyAccessToken(token)?.userId ?? null),
  ];
  // Sponsored ad spots: staff switch a spot on and place a sponsor on it for a period.
  const ads = new AdService({ db: db.db });
  await ads.load();
  admin.ads = ads;
  // Online computer opponents (streamer and creator bots) that staff add in the console.
  const bots = new BotService({ db: db.db });
  await bots.load();
  admin.bots = bots;
  const lessons = new LessonService({ db: db.db, puzzles: puzzleStore });
  await lessons.load();
  admin.lessons = lessons;
  lessonCatalog = () => lessons.catalog();
  // Signed-in accounts use their access token. In development, "dev:<id>:<name>"
  // tokens also get an account row on first use so friends and search can be tried.
  const resolveUser = async (token: string) => {
    const account = auth.verifyAccessToken(token);
    if (account) return account.userId;
    const id = devResolveUser(token);
    if (!id) return null;
    const name = token.split(':').slice(2).join(':');
    await ensureUser(db.db, { id, username: name.replace(/[^\w-]/g, '_') });
    return id;
  };
  // First-party analytics for the admin console (events only from visitors who allowed analytics).
  const analytics = new AnalyticsService({ db: db.db });
  analytics.start();
  admin.analytics = analytics;
  base.http = [...(base.http ?? []), analyticsRoutes(analytics, resolveUser)];
  const server = new ChessServer({
    ...base,
    admin,
    moderation: new Moderation(await DbModerationStore.load(db.db)),
    fairPlay: { store: await DbFairPlayStore.load(db.db) },
    store,
    persistence,
    leaderboards: new Leaderboards(new DbLeaderboardSource(db.db)),
    social: new SocialService(db.db, { privacyOf }),
    messages,
    tournaments,
    ads,
    bots,
    community,
    habits,
    awards,
    collections: new CollectionsService({ db: db.db }),
    streamers,
    events,
    broadcastSync,
    broadcastAnalyzer,
    // The inbox, notification settings and push tokens survive restarts and deploys.
    notificationStore: await DbNotificationStore.load(db.db),
    resolveUser,
  });
  sponsorDesk.attach((userId, title, body, url) => void server.notifications.notify(userId, { kind: 'system', title, body, url }));
  // Push campaigns from the admin console: send now, schedule, and triggers on what players do.
  const campaigns = new CampaignService({ db: db.db, notifications: server.notifications, isForeground: (id) => server.isForeground(id) });
  await campaigns.load();
  campaigns.start();
  admin.campaigns = campaigns;
  server.setActivityHooks(campaigns);
  // Profiles show the same live presence as friends lists.
  profileDeps.online = (id) => server.isOnline(id);
  profileDeps.liveGame = (id) => server.liveGameOf(id);
  return { server, close: () => db.close() };
}

const { server, close } = await start();
server.listen().then((p) => {
  console.log(`ChessMate game server listening on :${p} (ws path /ws, auth API /api/auth, social API /api/social, ${puzzleStore.count()} puzzles)`);
  // ~20,700 bundled puzzles, loaded in the background on first start.
  void loadBundledPuzzles(puzzleStore).catch((e) => console.warn('bundled puzzles failed to load:', e instanceof Error ? e.message : e));
  console.log(`Engine analysis: ${engine} (starts on first request)`);
  console.log(`Dig Deep: Lichess databases ${lichessExplorer.configured ? 'on' : 'off (set LICHESS_TOKEN, a free token from lichess.org/account/oauth/token)'}; ChessMate games on`);
  console.log(`Push notifications: Expo push service${process.env.EXPO_ACCESS_TOKEN ? ' with EXPO_ACCESS_TOKEN' : ''}. Delivery errors show in Admin → Notifications → Health`);
  const p2 = oauthConfigFromEnv();
  console.log(`Sign in with Google: ${p2.googleClientIds.length ? 'on' : 'off (set GOOGLE_CLIENT_IDS)'}; Sign in with Apple: ${p2.appleClientIds.length ? `on (${p2.appleClientIds.join(', ')})` : 'off'}`);
  if (!production) {
    const lan = Object.values(networkInterfaces())
      .flat()
      .filter((a) => a && a.family === 'IPv4' && !a.internal)
      .map((a) => a!.address);
    for (const ip of lan) console.log(`Phones on the same Wi-Fi reach this server at http://${ip}:${p} (open http://${ip}:${p}/api/stats in the phone's browser to check)`);
  }
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () =>
    void server
      .close()
      .then(close)
      .then(() => puzzleStore.close())
      .then(() => process.exit(0)),
  );
}
