import { DEFAULT_SETTINGS, isStaff } from '@chessmate/core';
import { DEFAULT_PGLITE_DIR, abortStaleGames, ensureUser, openDb } from '@chessmate/db';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { AdminService, DbModerationStore } from './admin';
import { DbFairPlayStore } from './fairplay';
import { AuthService, DbAuthStore, mailerFromEnv, MemoryAuthStore, OAuthVerifier, authRoutes, oauthConfigFromEnv, type AuthStore } from './auth';
import { CoachService } from './coach/coachService';
import { ClaudeCoachLlm, DEFAULT_COACH_MODEL } from './coach/llm';
import { createAnalysisService } from './engine';
import { DbLeaderboardSource, Leaderboards } from './leaderboard';
import { DbGamePersistence, DbPlayerStore, loadRatingsInto } from './persistence';
import { AccountProfileBackend, DevProfileBackend, MemoryProfileStore, dbGamesOf, profileRoutes, type FinishedGame } from './profiles';
import { PuzzleApi } from './puzzles/api';
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
import { MessageService } from './messages/service';
import { TournamentService } from './tournaments/service';
import { stripeFromEnv } from './payments/stripe';
import { gameRoutes } from './games/http';
import { donateRoutes } from './payments/donate';

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

const coachModel = process.env.COACH_MODEL || DEFAULT_COACH_MODEL;
const coach = new CoachService({
  llm: process.env.ANTHROPIC_API_KEY ? new ClaudeCoachLlm(coachModel) : undefined,
  log: (m) => console.warn(m),
});
console.log(coach.aiEnabled ? `AI coach on (${coachModel})` : 'AI coach off: set ANTHROPIC_API_KEY to enable it (rule-based feedback in the meantime)');
// The engine serves the analysis board and broadcasts; game reviews run on players' devices.
const { service: analysis, engine } = createAnalysisService(process.env);
const puzzleStore = await openPuzzleStore();
const puzzles = new PuzzleApi({ store: puzzleStore });
// Ratings are read from memory during play and written to the database after
// every rated game (DbGamePersistence). The cache is warmed from the database on
// startup so a restart never resets anyone to 1500.
const ratingRepo = new MemoryRatingRepository();
const ratings = new RatingService(ratingRepo);

function services(authStore: AuthStore, gamesOf?: (userId: string, limit: number) => Promise<FinishedGame[]>) {
  const auth = new AuthService({ store: authStore, mailer: mailerFromEnv(), secret: authSecret(), oauth: new OAuthVerifier(oauthConfigFromEnv()) });
  // Signed-in players get their own profile; dev tokens and the seeded demo players use the dev backend.
  const profileDeps = new AccountProfileBackend(auth, ratings, production ? null : new DevProfileBackend(), gamesOf);
  const profileStore = new MemoryProfileStore();
  const profiles = profileRoutes(profileDeps, profileStore);
  const base: ServerOptions = {
    port,
    auth,
    ratings,
    coach,
    analysis,
    http: [authRoutes(auth), profiles, (req, res) => puzzles.handle(req, res)],
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
  const { auth, base, profileDeps, profileStore } = services(new DbAuthStore(db.db), dbGamesOf(db.db));
  base.http = [
    ...(base.http ?? []),
    donateRoutes(stripeFromEnv()),
    gameRoutes(db.db, {
      viewerOf: (token) => auth.verifyAccessToken(token)?.userId ?? null,
      gamesHidden: async (id) => !((await profileStore.get(id))?.settings.privacy.showGames ?? DEFAULT_SETTINGS.privacy.showGames),
    }),
  ];
  // Staff console: roles and closed accounts load now; ADMIN_USERNAMES promotes those accounts to admin.
  const admin = new AdminService({ db: db.db, auth });
  await admin.load((process.env.ADMIN_USERNAMES ?? '').split(','));
  profileDeps.titles = admin.titles;
  const persistence = new DbGamePersistence(db.db);
  const store = await DbPlayerStore.load(db.db, persistence);
  const privacy = (id: string) => profileStore.get(id)?.settings.privacy.messages ?? DEFAULT_SETTINGS.privacy.messages;
  const messages = new MessageService({ db: db.db, privacyOf: privacy, isStaff: (id) => isStaff(admin.roleOf(id)) });
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
  const tournaments = new TournamentService({ db: db.db, stripe: stripeFromEnv() });
  await tournaments.load();
  admin.tournaments = tournaments;
  const server = new ChessServer({
    ...base,
    admin,
    moderation: new Moderation(await DbModerationStore.load(db.db)),
    fairPlay: { store: await DbFairPlayStore.load(db.db) },
    store,
    persistence,
    leaderboards: new Leaderboards(new DbLeaderboardSource(db.db)),
    social: new SocialService(db.db),
    messages,
    tournaments,
    community,
    habits,
    awards,
    streamers,
    events,
    broadcastSync,
    broadcastAnalyzer,
    // Signed-in accounts use their access token. In development, "dev:<id>:<name>"
    // tokens also get an account row on first use so friends and search can be tried.
    resolveUser: async (token) => {
      const account = auth.verifyAccessToken(token);
      if (account) return account.userId;
      const id = devResolveUser(token);
      if (!id) return null;
      const name = token.split(':').slice(2).join(':');
      await ensureUser(db.db, { id, username: name.replace(/[^\w-]/g, '_') });
      return id;
    },
  });
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
