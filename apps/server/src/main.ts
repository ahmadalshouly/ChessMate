import { DEFAULT_PGLITE_DIR, abortStaleGames, ensureUser, openDb } from '@chessmate/db';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { AuthService, ConsoleMailer, DbAuthStore, MemoryAuthStore, OAuthVerifier, authRoutes, oauthConfigFromEnv, type AuthStore } from './auth';
import { CoachService } from './coach/coachService';
import { ClaudeCoachLlm, DEFAULT_COACH_MODEL } from './coach/llm';
import { createAnalysisService } from './engine';
import { DbLeaderboardSource, Leaderboards } from './leaderboard';
import { DbGamePersistence, DbPlayerStore, loadRatingsInto } from './persistence';
import { AccountProfileBackend, DevProfileBackend, MemoryProfileStore, profileRoutes } from './profiles';
import { PuzzleApi } from './puzzles/api';
import { openPuzzleStore } from './puzzles/setup';
import { MemoryRatingRepository, RatingService } from './ratingService';
import { ChessServer, devResolveUser, type ServerOptions } from './server';
import { SocialService } from './social/service';

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
const { service: analysis, engine } = createAnalysisService();
const puzzleStore = await openPuzzleStore();
const puzzles = new PuzzleApi({ store: puzzleStore });
// Ratings are read from memory during play and written to the database after
// every rated game (DbGamePersistence). The cache is warmed from the database on
// startup so a restart never resets anyone to 1500.
const ratingRepo = new MemoryRatingRepository();
const ratings = new RatingService(ratingRepo);

function services(authStore: AuthStore) {
  const auth = new AuthService({ store: authStore, mailer: new ConsoleMailer(), secret: authSecret(), oauth: new OAuthVerifier(oauthConfigFromEnv()) });
  // Signed-in players get their own profile; dev tokens and the seeded demo players use the dev backend.
  const profileDeps = new AccountProfileBackend(auth, ratings, production ? null : new DevProfileBackend());
  const profiles = profileRoutes(profileDeps, new MemoryProfileStore());
  const base: ServerOptions = {
    port,
    auth,
    ratings,
    coach,
    analysis,
    http: [authRoutes(auth), profiles, (req, res) => puzzles.handle(req, res)],
    adminToken: process.env.ADMIN_TOKEN || undefined,
  };
  return { auth, base };
}

// Postgres when DATABASE_URL is set, otherwise embedded Postgres in .data/pglite.
// CHESSMATE_DB=off runs fully in memory (nothing saved, no friends).
async function start() {
  if (process.env.CHESSMATE_DB === 'off') {
    console.log('Database disabled (CHESSMATE_DB=off): accounts and games are not saved, friends are off');
    const { base } = services(new MemoryAuthStore());
    return { server: new ChessServer(base), close: async () => {} };
  }
  const db = openDb();
  await db.migrate();
  const stale = await abortStaleGames(db.db);
  const stored = await loadRatingsInto(ratingRepo, db.db);
  console.log(`Database ready (${db.kind}: ${db.location})${stale ? `, closed ${stale} unfinished game(s)` : ''}, ${stored} rating(s) loaded`);
  const { auth, base } = services(new DbAuthStore(db.db));
  const persistence = new DbGamePersistence(db.db);
  const store = await DbPlayerStore.load(db.db, persistence);
  return {
    server: new ChessServer({
      ...base,
      store,
      persistence,
      leaderboards: new Leaderboards(new DbLeaderboardSource(db.db)),
      social: new SocialService(db.db),
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
    }),
    close: () => db.close(),
  };
}

const { server, close } = await start();
server.listen().then((p) => {
  console.log(`ChessMate game server listening on :${p} (ws path /ws, auth API /api/auth, social API /api/social, ${puzzleStore.count()} puzzles)`);
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
