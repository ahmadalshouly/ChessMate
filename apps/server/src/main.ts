import { createAnalysisService } from './engine';
import { ChessServer } from './server';

const port = Number(process.env.PORT ?? 8787);
const { service: analysis, engine } = createAnalysisService();
const server = new ChessServer({ port, analysis });
server.listen().then((p) => {
  console.log(`ChessMate game server listening on :${p} (ws path /ws)`);
  console.log(`Engine analysis: ${engine} (starts on first request)`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void server.close().then(() => process.exit(0)));
}
