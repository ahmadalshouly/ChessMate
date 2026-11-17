import { abortStaleGames, openDb } from '@chessmate/db';
import { CoachService } from './coach/coachService';
import { ClaudeCoachLlm, DEFAULT_COACH_MODEL } from './coach/llm';
import { createAnalysisService } from './engine';
import { AuthService, ConsoleMailer, MemoryAuthStore, authRoutes, authSecretFromEnv } from './auth';
import { DbLeaderboardSource, Leaderboards } from './leaderboard';
import { DbGamePersistence, DbPlayerStore } from './persistence';
import { ChessServer, type ServerOptions } from './server';

const port = Number(process.env.PORT ?? 8787);
const auth = new AuthService({ store: new MemoryAuthStore(), mailer: new ConsoleMailer(), secret: authSecretFromEnv() });
const coachModel = process.env.COACH_MODEL || DEFAULT_COACH_MODEL;
const coach = new CoachService({
  llm: process.env.ANTHROPIC_API_KEY ? new ClaudeCoachLlm(coachModel) : undefined,
  log: (m) => console.warn(m),
});
console.log(coach.aiEnabled ? `AI coach on (${coachModel})` : 'AI coach off: set ANTHROPIC_API_KEY to enable it (rule-based feedback in the meantime)');
const { service: analysis, engine } = createAnalysisService();
const base: ServerOptions = { port, auth, coach, analysis, http: [authRoutes(auth)], adminToken: process.env.ADMIN_TOKEN || undefined };

// Postgres when DATABASE_URL is set, otherwise embedded Postgres in .data/pglite.
// CHESSMATE_DB=off runs fully in memory (nothing saved).
async function start() {
  if (process.env.CHESSMATE_DB === 'off') {
    console.log('Database disabled (CHESSMATE_DB=off): games are not saved');
    return { server: new ChessServer(base), close: async () => {} };
  }
  const db = openDb();
  await db.migrate();
  const stale = await abortStaleGames(db.db);
  console.log(`Database ready (${db.kind}: ${db.location})${stale ? `, closed ${stale} unfinished game(s)` : ''}`);
  const persistence = new DbGamePersistence(db.db);
  const store = await DbPlayerStore.load(db.db, persistence);
  return {
    server: new ChessServer({ ...base, store, persistence, leaderboards: new Leaderboards(new DbLeaderboardSource(db.db)) }),
    close: () => db.close(),
  };
}

const { server, close } = await start();
server.listen().then((p) => {
  console.log(`ChessMate game server listening on :${p} (ws path /ws, auth API /api/auth)`);
  console.log(`Engine analysis: ${engine} (starts on first request)`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () =>
    void server
      .close()
      .then(close)
      .then(() => process.exit(0)),
  );
}
