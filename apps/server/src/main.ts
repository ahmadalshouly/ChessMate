import { ChessServer } from './server';

const port = Number(process.env.PORT ?? 8787);
const server = new ChessServer({ port, adminToken: process.env.ADMIN_TOKEN || undefined });
server.listen().then((p) => console.log(`ChessMate game server listening on :${p} (ws path /ws)`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void server.close().then(() => process.exit(0)));
}
