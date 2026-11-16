import { PuzzleApi } from './puzzles/api';
import { openPuzzleStore } from './puzzles/setup';
import { ChessServer } from './server';

const port = Number(process.env.PORT ?? 8787);
const puzzleStore = await openPuzzleStore();
const puzzles = new PuzzleApi({ store: puzzleStore });
const server = new ChessServer({ port, httpHandlers: [(req, res) => puzzles.handle(req, res)] });
server.listen().then((p) => console.log(`ChessMate game server listening on :${p} (ws path /ws, ${puzzleStore.count()} puzzles)`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () =>
    void server.close().then(() => {
      puzzleStore.close();
      process.exit(0);
    }),
  );
}
