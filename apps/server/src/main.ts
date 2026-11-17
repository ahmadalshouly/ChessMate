import { abortStaleGames, ensureUser, openDb } from '@chessmate/db';
import { DbGamePersistence, DbPlayerStore } from './persistence';
import { ChessServer, devResolveUser } from './server';
import { SocialService } from './social/service';

const port = Number(process.env.PORT ?? 8787);

// Postgres when DATABASE_URL is set, otherwise embedded Postgres in .data/pglite.
// CHESSMATE_DB=off runs fully in memory (nothing saved, no friends).
async function start() {
  if (process.env.CHESSMATE_DB === 'off') {
    console.log('Database disabled (CHESSMATE_DB=off): games are not saved and friends are off');
    return { server: new ChessServer({ port }), close: async () => {} };
  }
  const db = openDb();
  await db.migrate();
  const stale = await abortStaleGames(db.db);
  console.log(`Database ready (${db.kind}: ${db.location})${stale ? `, closed ${stale} unfinished game(s)` : ''}`);
  const persistence = new DbGamePersistence(db.db);
  const store = await DbPlayerStore.load(db.db, persistence);
  const social = new SocialService(db.db);
  const server = new ChessServer({
    port,
    store,
    persistence,
    social,
    // Development: "dev:<id>:<name>" tokens get an account row on first use so
    // friends and search work before sign-up is wired in.
    resolveUser: async (token) => {
      const id = devResolveUser(token);
      if (!id) return null;
      const name = token.split(':').slice(2).join(':');
      await ensureUser(db.db, { id, username: name.replace(/[^\w-]/g, '_') });
      return id;
    },
  });
  return { server, close: () => db.close() };
}

const { server, close } = await start();
server.listen().then((p) => console.log(`ChessMate game server listening on :${p} (ws path /ws, social API /api/social)`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () =>
    void server
      .close()
      .then(close)
      .then(() => process.exit(0)),
  );
}
