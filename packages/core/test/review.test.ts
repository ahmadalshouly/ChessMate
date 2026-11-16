import { describe, expect, it } from 'vitest';
import { AnalysisError, SAMPLE_GAME_ANALYSIS, buildChatFacts, buildReviewPrompt, judgeGame, moveLabel, offlineReview, prepareReview } from '../src';

describe('coach review facts', () => {
  it('judges every move of the sample game', () => {
    const judged = judgeGame(SAMPLE_GAME_ANALYSIS);
    expect(judged).toHaveLength(14);
    const cls = Object.fromEntries(judged.map((j) => [j.move.san, j.judgement.classification]));
    expect(cls.e4).toBe('book');
    expect(cls.Nxe5).toBe('blunder');
    expect(cls.Nxf7).toBe('blunder');
    expect(cls['Nf3#']).toBe('best');
  });

  it('picks the player own errors as key moments, in game order', () => {
    const facts = prepareReview(SAMPLE_GAME_ANALYSIS, 'w');
    const plies = facts.keyMoves.map((k) => k.judged.move.ply);
    expect(plies).toEqual([...plies].sort((a, b) => a - b));
    expect(plies).toContain(7);
    expect(plies).toContain(9);
    expect(facts.accuracy.w).toBeLessThan(facts.accuracy.b);
  });

  it('builds a prompt containing only real moves', () => {
    const facts = prepareReview(SAMPLE_GAME_ANALYSIS, 'w');
    const prompt = buildReviewPrompt(SAMPLE_GAME_ANALYSIS, facts);
    expect(prompt).toContain('4. Nxe5');
    expect(prompt).toContain('Engine best move: Nxd4');
    expect(prompt).toContain('Blackburne Shilling');
  });

  it('writes an offline review without a language model', () => {
    const review = offlineReview(prepareReview(SAMPLE_GAME_ANALYSIS, 'w'));
    expect(review.source).toBe('offline');
    expect(review.keyMoments.find((k) => k.ply === 7)?.betterMove).toBe('Nxd4');
    expect(review.summary).toMatch(/accuracy/);
  });

  it('rejects analysis that does not match the rules', () => {
    const bad = structuredClone(SAMPLE_GAME_ANALYSIS);
    bad.moves[2]!.uci = 'g1g3';
    expect(() => judgeGame(bad)).toThrow(AnalysisError);
  });

  it('labels moves and describes a chat position', () => {
    expect(moveLabel(1)).toBe('1.');
    expect(moveLabel(8)).toBe('4...');
    const facts = buildChatFacts({ fen: SAMPLE_GAME_ANALYSIS.moves[6]!.fenBefore, messages: [{ role: 'user', text: 'why?' }] });
    expect(facts).toContain('Legal moves:');
    expect(facts).toContain('Nxd4');
  });
});
