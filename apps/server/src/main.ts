import { ChessServer } from './server';
import { DevProfileBackend, MemoryProfileStore, profileRoutes } from './profiles';

const port = Number(process.env.PORT ?? 8787);
// Profiles run on the dev backend until the accounts and persistence services are wired in.
const profiles = profileRoutes(new DevProfileBackend(), new MemoryProfileStore());
const server = new ChessServer({ port, http: [profiles] });
server.listen().then((p) => console.log(`ChessMate game server listening on :${p} (ws path /ws, REST /api)`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void server.close().then(() => process.exit(0)));
}
