import {
  AnalysisError,
  buildChatFacts,
  buildReviewPrompt,
  coachLanguageNote,
  offlineReview,
  prepareReview,
  type CoachChatReply,
  type CoachChatRequest,
  type CoachMoveNote,
  type CoachReview,
  type Color,
  type GameAnalysis,
} from '@chessmate/core';
import { createHash } from 'node:crypto';
import { LlmError, type CoachLlm } from './llm';

export const REVIEW_SYSTEM_PROMPT = `You are ChessMate Coach, a warm, precise chess teacher reviewing a finished game for one player.
You receive engine facts and tactical facts. The engine is always right; your job is to explain WHY in plain language.

Rules:
- Never invent moves or variations. Only cite moves that appear in the facts (played moves, engine best moves, engine lines, listed threats).
- Speak to the player as "you". Refer to the opponent as "your opponent".
- Adapt depth to the player's rating: simple ideas (loose pieces, checks, captures, threats) below 1200; plans, structure and calculation above 1800.
- Be concrete: name pieces and squares. Avoid engine jargon such as centipawns; say "this loses a knight" or "this lets White mate".
- Be encouraging but honest. No filler.

Write:
- summary: 2-4 sentences on how the game went and where it turned.
- keyMoments: one entry per key moment given (same ply numbers). explanation is 2-4 sentences: what the move did wrong (or, for an opponent error, how the player could have punished it), why the better move works, and one takeaway. theme is a 1-3 word tag like "hanging piece", "back rank", "missed fork", "king safety", "endgame technique".
- mistakePatterns: 1-3 recurring habits behind the player's errors, as plain sentences. Empty if the player made no real errors.
- studyThemes: 2-3 specific things to study next, each with a one-sentence reason tied to this game.`;

export const CHAT_SYSTEM_PROMPT = `You are ChessMate Coach, a friendly chess teacher answering questions about one position.
You receive facts computed by our engine and tactics code; trust them over your own calculation.
- Only recommend moves that are legal in the position (they are listed). Prefer the engine's move when one is given.
- Do not invent long variations. Explain ideas: threats, weaknesses, piece activity, plans.
- Keep answers short (2-5 sentences) unless the player asks for more. Plain language, name squares and pieces.
- If asked something unrelated to chess, steer back to the game politely.`;

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'keyMoments', 'mistakePatterns', 'studyThemes'],
  properties: {
    summary: { type: 'string' },
    keyMoments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ply', 'explanation', 'theme'],
        properties: { ply: { type: 'integer' }, explanation: { type: 'string' }, theme: { type: 'string' } },
      },
    },
    mistakePatterns: { type: 'array', items: { type: 'string' } },
    studyThemes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['theme', 'why'],
        properties: { theme: { type: 'string' }, why: { type: 'string' } },
      },
    },
  },
} as const;

interface ReviewModelOutput {
  summary: string;
  keyMoments: { ply: number; explanation: string; theme: string }[];
  mistakePatterns: string[];
  studyThemes: { theme: string; why: string }[];
}

export interface CoachServiceOptions {
  /** Language model; when absent the coach answers with rule-based feedback. */
  llm?: CoachLlm;
  cacheSize?: number;
  log?: (msg: string) => void;
}

export class CoachInputError extends Error {}

/**
 * Turns engine analysis into a plain-language game review and answers
 * questions about positions. Reviews are cached by content so reopening a
 * game costs nothing.
 */
export class CoachService {
  private readonly cache = new Map<string, CoachReview>();
  private readonly inflight = new Map<string, Promise<CoachReview>>();

  constructor(private readonly opts: CoachServiceOptions = {}) {}

  get aiEnabled(): boolean {
    return !!this.opts.llm;
  }

  async review(analysis: GameAnalysis, perspective: Color, language?: string): Promise<CoachReview> {
    if (perspective !== 'w' && perspective !== 'b') throw new CoachInputError('perspective must be "w" or "b"');
    const key = createHash('sha256').update(perspective).update(coachLanguageNote(language)).update(JSON.stringify(analysis)).digest('hex');
    const hit = this.cache.get(key);
    if (hit) return hit;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = this.computeReview(analysis, perspective, language).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    const review = await p;
    if (review.source === 'ai') this.remember(key, review);
    return review;
  }

  private async computeReview(analysis: GameAnalysis, perspective: Color, language?: string): Promise<CoachReview> {
    let facts;
    try {
      facts = prepareReview(analysis, perspective);
    } catch (e) {
      if (e instanceof AnalysisError) throw new CoachInputError(e.message);
      throw new CoachInputError('Malformed analysis');
    }
    const fallback = offlineReview(facts);
    const llm = this.opts.llm;
    if (!llm) return fallback;
    try {
      const raw = await llm.complete({
        system: REVIEW_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildReviewPrompt(analysis, facts) + coachLanguageNote(language) }],
        jsonSchema: REVIEW_SCHEMA as unknown as Record<string, unknown>,
        effort: 'high',
      });
      const out = parseReviewOutput(raw);
      const byPly = new Map(out.keyMoments.map((k) => [k.ply, k]));
      const keyMoments: CoachMoveNote[] = fallback.keyMoments.map((note) => {
        const ai = byPly.get(note.ply);
        return ai ? { ...note, explanation: ai.explanation.trim(), theme: ai.theme.trim() || note.theme } : note;
      });
      return {
        ...fallback,
        summary: out.summary.trim(),
        keyMoments,
        mistakePatterns: out.mistakePatterns.map((s) => s.trim()).filter(Boolean).slice(0, 5),
        studyThemes: out.studyThemes.filter((t) => t.theme && t.why).slice(0, 4),
        source: 'ai',
      };
    } catch (e) {
      this.opts.log?.(`coach review fell back to offline: ${e instanceof Error ? e.message : e}`);
      return fallback;
    }
  }

  async chat(req: CoachChatRequest): Promise<CoachChatReply> {
    const messages = validateChat(req);
    let facts: string;
    try {
      facts = buildChatFacts(req);
    } catch (e) {
      throw new CoachInputError(e instanceof Error ? e.message : 'Invalid position');
    }
    const llm = this.opts.llm;
    if (!llm) {
      return {
        reply: req.engine?.bestMove
          ? `The AI coach is offline. The engine's suggestion here is ${req.engine.bestMove}.`
          : 'The AI coach is offline right now. Set ANTHROPIC_API_KEY on the server to enable it.',
        source: 'offline',
      };
    }
    // Facts ride on the first user turn so the system prompt stays cacheable.
    const turns = messages.map((m, i) => ({
      role: m.role === 'coach' ? ('assistant' as const) : ('user' as const),
      content: i === 0 ? `<position_facts>\n${facts}\n</position_facts>${coachLanguageNote(req.language)}\n\n${m.text}` : m.text,
    }));
    try {
      const reply = await llm.complete({ system: CHAT_SYSTEM_PROMPT, messages: turns, effort: 'medium', maxTokens: 4000 });
      return { reply: reply.trim(), source: 'ai' };
    } catch (e) {
      if (e instanceof LlmError) throw e;
      throw new LlmError('Coach unavailable', true);
    }
  }

  private remember(key: string, review: CoachReview) {
    this.cache.set(key, review);
    const max = this.opts.cacheSize ?? 500;
    while (this.cache.size > max) this.cache.delete(this.cache.keys().next().value!);
  }
}

function parseReviewOutput(raw: string): ReviewModelOutput {
  const v = JSON.parse(raw) as ReviewModelOutput;
  const ok =
    v &&
    typeof v.summary === 'string' &&
    Array.isArray(v.keyMoments) &&
    v.keyMoments.every((k) => Number.isInteger(k?.ply) && typeof k.explanation === 'string' && typeof k.theme === 'string') &&
    Array.isArray(v.mistakePatterns) &&
    v.mistakePatterns.every((s) => typeof s === 'string') &&
    Array.isArray(v.studyThemes) &&
    v.studyThemes.every((t) => typeof t?.theme === 'string' && typeof t.why === 'string');
  if (!ok) throw new Error('Review output did not match schema');
  return v;
}

const MAX_TURNS = 20;
const MAX_TEXT = 2000;

function validateChat(req: CoachChatRequest): CoachChatRequest['messages'] {
  if (!req || typeof req.fen !== 'string') throw new CoachInputError('fen is required');
  const msgs = req.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) throw new CoachInputError('messages are required');
  const recent = msgs.slice(-MAX_TURNS);
  for (const m of recent) {
    if ((m.role !== 'user' && m.role !== 'coach') || typeof m.text !== 'string' || !m.text.trim()) {
      throw new CoachInputError('Each message needs a role ("user" or "coach") and text');
    }
    if (m.text.length > MAX_TEXT) throw new CoachInputError('Message too long');
  }
  // The conversation must start with and end on the player.
  while (recent.length && recent[0]!.role !== 'user') recent.shift();
  if (!recent.length || recent[recent.length - 1]!.role !== 'user') throw new CoachInputError('Last message must be from the user');
  return recent;
}

