import { abortStaleGames, openDb } from '@chessmate/db';
import { DbGamePersistence, DbPlayerStore } from './persistence';
import { ChessServer } from './server';

const port = Number(process.env.PORT ?? 8787);

// Postgres when DATABASE_URL is set, otherwise embedded Postgres in .data/pglite.
// CHESSMATE_DB=off runs fully in memory (nothing saved).
async function start() {
  if (process.env.CHESSMATE_DB === 'off') {
    console.log('Database disabled (CHESSMATE_DB=off): games are not saved');
    return { server: new ChessServer({ port }), close: async () => {} };
  }
  const db = openDb();
  await db.migrate();
  const stale = await abortStaleGames(db.db);
  console.log(`Database ready (${db.kind}: ${db.location})${stale ? `, closed ${stale} unfinished game(s)` : ''}`);
  const persistence = new DbGamePersistence(db.db);
  const store = await DbPlayerStore.load(db.db, persistence);
  return { server: new ChessServer({ port, store, persistence }), close: () => db.close() };
}

const { server, close } = await start();
server.listen().then((p) => console.log(`ChessMate game server listening on :${p} (ws path /ws)`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () =>
    void server
      .close()
      .then(close)
      .then(() => process.exit(0)),
  );
}
