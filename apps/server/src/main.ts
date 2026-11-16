import { AuthService, ConsoleMailer, MemoryAuthStore, authRoutes, authSecretFromEnv } from './auth';
import { ChessServer } from './server';

const port = Number(process.env.PORT ?? 8787);
const auth = new AuthService({ store: new MemoryAuthStore(), mailer: new ConsoleMailer(), secret: authSecretFromEnv() });
const server = new ChessServer({ port, auth, http: [authRoutes(auth)] });
server.listen().then((p) => console.log(`ChessMate game server listening on :${p} (ws path /ws, auth API /api/auth)`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void server.close().then(() => process.exit(0)));
}
