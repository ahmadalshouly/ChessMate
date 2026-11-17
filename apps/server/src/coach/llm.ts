import Anthropic from '@anthropic-ai/sdk';

export interface LlmTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmTurn[];
  /** JSON schema the reply must follow. Omit for free text. */
  jsonSchema?: Record<string, unknown>;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
}

/** The coach's only dependency on a language model. Tests use a fake. */
export interface CoachLlm {
  complete(req: LlmRequest): Promise<string>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export const DEFAULT_COACH_MODEL = 'claude-opus-5-5';

/**
 * Claude-backed coach model. Reads ANTHROPIC_API_KEY from the environment.
 * Server-side fallbacks re-run a request on another model if the primary one
 * declines it, so a review rarely comes back empty.
 */
export class ClaudeCoachLlm implements CoachLlm {
  private readonly client: Anthropic;

  constructor(
    private readonly model = DEFAULT_COACH_MODEL,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic({ timeout: 120_000, maxRetries: 2 });
  }

  async complete(req: LlmRequest): Promise<string> {
    let res;
    try {
      res = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // Stable system prompt first so repeated reviews hit the prompt cache.
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: req.messages,
        output_config: {
          effort: req.effort ?? 'medium',
          ...(req.jsonSchema ? { format: { type: 'json_schema', schema: req.jsonSchema } } : {}),
        },
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new LlmError('Coach is busy, try again shortly', true);
      if (e instanceof Anthropic.AuthenticationError) throw new LlmError('Coach API key is invalid', false);
      if (e instanceof Anthropic.BadRequestError) throw new LlmError(`Coach request rejected: ${e.message}`, false);
      if (e instanceof Anthropic.APIError) throw new LlmError(`Coach unavailable (${e.status ?? 'network'})`, true);
      throw e;
    }
    if (res.stop_reason === 'refusal') throw new LlmError('Coach declined this request', false);
    if (res.stop_reason === 'max_tokens') throw new LlmError('Coach reply was cut off', true);
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!text) throw new LlmError('Coach returned no text', true);
    return text;
  }
}
