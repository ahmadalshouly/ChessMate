import { SAMPLE_GAME_ANALYSIS, type CoachReview } from '@chessmate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CoachService } from '../src/coach/coachService';
import { LlmError, type CoachLlm, type LlmRequest } from '../src/coach/llm';
import { ChessServer } from '../src/server';

class FakeLlm implements CoachLlm {
  calls: LlmRequest[] = [];
  constructor(private readonly reply: (req: LlmRequest) => string) {}
  async complete(req: LlmRequest) {
    this.calls.push(req);
    return this.reply(req);
  }
}

const aiReview = (req: LlmRequest) => {
  const plies = [...req.messages[0]!.content.matchAll(/Key moment \d+: ply (\d+)/g)].map((m) => Number(m[1]));
  return JSON.stringify({
    summary: 'You fell for the Shilling trap.',
    keyMoments: plies.map((ply) => ({ ply, explanation: `Explanation for ply ${ply}`, theme: 'greed' })),
    mistakePatterns: ['Grabbing pawns before checking threats'],
    studyThemes: [{ theme: 'Opening traps', why: 'You lost to one.' }],
  });
};

describe('CoachService', () => {
  it('merges the model explanations onto engine facts and caches the review', async () => {
    const llm = new FakeLlm(aiReview);
    const coach = new CoachService({ llm });
    const r = await coach.review(SAMPLE_GAME_ANALYSIS, 'w');
    expect(r.source).toBe('ai');
    expect(r.summary).toBe('You fell for the Shilling trap.');
    const nxe5 = r.keyMoments.find((k) => k.san === 'Nxe5')!;
    expect(nxe5.explanation).toBe('Explanation for ply 7');
    expect(nxe5.betterMove).toBe('Nxd4');
    expect(nxe5.classification).toBe('blunder');
    expect(llm.calls[0]!.jsonSchema).toBeDefined();
    await coach.review(SAMPLE_GAME_ANALYSIS, 'w');
    expect(llm.calls).toHaveLength(1);
  });

  it('falls back to the offline review when the model fails or returns junk', async () => {
    const junk = await new CoachService({ llm: new FakeLlm(() => '{"nope":1}') }).review(SAMPLE_GAME_ANALYSIS, 'w');
    expect(junk.source).toBe('offline');
    const down = new CoachService({
      llm: { complete: () => Promise.reject(new LlmError('down', true)) },
    });
    expect((await down.review(SAMPLE_GAME_ANALYSIS, 'b')).source).toBe('offline');
  });

  it('chats with position facts on the first turn only', async () => {
    const llm = new FakeLlm(() => ' Take back with the pawn. ');
    const coach = new CoachService({ llm });
    const fen = SAMPLE_GAME_ANALYSIS.moves[6]!.fenBefore;
    const res = await coach.chat({
      fen,
      messages: [
        { role: 'user', text: 'What should I play?' },
        { role: 'coach', text: 'Look at d4.' },
        { role: 'user', text: 'Why not Nxe5?' },
      ],
    });
    expect(res).toEqual({ reply: 'Take back with the pawn.', source: 'ai' });
    const msgs = llm.calls[0]!.messages;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[0]!.content).toContain('<position_facts>');
    expect(msgs[2]!.content).toBe('Why not Nxe5?');
  });

  it('rejects bad chat input', async () => {
    const coach = new CoachService();
    await expect(coach.chat({ fen: 'garbage', messages: [{ role: 'user', text: 'hi' }] })).rejects.toThrow();
    await expect(coach.chat({ fen: SAMPLE_GAME_ANALYSIS.moves[0]!.fenBefore, messages: [] })).rejects.toThrow();
  });
});

describe('coach HTTP routes', () => {
  let server: ChessServer;
  let base: string;
  beforeAll(async () => {
    server = new ChessServer({ port: 0, coach: new CoachService({ llm: new FakeLlm(aiReview) }) });
    base = `http://localhost:${await server.listen()}`;
  });
  afterAll(() => server.close());

  const post = (path: string, body: unknown, token = 'guest:Tester') =>
    fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('reports status', async () => {
    const res = await fetch(`${base}/coach/status`);
    expect(await res.json()).toEqual({ ai: true, analyzer: false });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('requires auth', async () => {
    expect((await post('/coach/review', {}, 'nonsense')).status).toBe(401);
  });

  it('returns a review', async () => {
    const res = await post('/coach/review', { analysis: SAMPLE_GAME_ANALYSIS, perspective: 'w' });
    expect(res.status).toBe(200);
    const review = (await res.json()) as CoachReview;
    expect(review.keyMoments.length).toBeGreaterThan(0);
  });

  it('explains bad input', async () => {
    const res = await post('/coach/review', { game: { uciMoves: ['e2e4'] }, perspective: 'w' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/analysis/);
  });
});
