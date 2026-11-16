import { CoachService } from './coach/coachService';
import { ClaudeCoachLlm, DEFAULT_COACH_MODEL } from './coach/llm';
import { ChessServer } from './server';

const port = Number(process.env.PORT ?? 8787);
const coachModel = process.env.COACH_MODEL || DEFAULT_COACH_MODEL;
const coach = new CoachService({
  llm: process.env.ANTHROPIC_API_KEY ? new ClaudeCoachLlm(coachModel) : undefined,
  log: (m) => console.warn(m),
});
console.log(coach.aiEnabled ? `AI coach on (${coachModel})` : 'AI coach off: set ANTHROPIC_API_KEY to enable it (rule-based feedback in the meantime)');
const server = new ChessServer({ port, coach });
server.listen().then((p) => console.log(`ChessMate game server listening on :${p} (ws path /ws)`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void server.close().then(() => process.exit(0)));
}
