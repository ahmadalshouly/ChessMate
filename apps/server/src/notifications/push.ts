/**
 * Minimal Expo push client (https://docs.expo.dev/push-notifications/sending-notifications/).
 * No SDK dependency: one POST per 100 messages. Tokens that Expo reports as
 * DeviceNotRegistered are handed back so the caller can delete them.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string | null>;
  sound?: 'default' | null;
  badge?: number;
  /** Android channel, created by the app. */
  channelId?: string;
  /** iOS thread grouping / Android tag so a newer "your turn" replaces the older one. */
  threadId?: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Tokens to forget (uninstalled app, revoked permission). */
  invalidTokens: string[];
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult>;
}

export const isExpoPushToken = (t: unknown): t is string =>
  typeof t === 'string' && t.length < 256 && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);

type Ticket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };

export class ExpoPushSender implements PushSender {
  constructor(
    private readonly opts: { accessToken?: string; fetch?: typeof fetch; log?: (msg: string) => void } = {},
  ) {}

  async send(messages: PushMessage[]): Promise<PushResult> {
    const result: PushResult = { sent: 0, failed: 0, invalidTokens: [] };
    const doFetch = this.opts.fetch ?? fetch;
    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      try {
        const res = await doFetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(this.opts.accessToken ? { authorization: `Bearer ${this.opts.accessToken}` } : {}),
          },
          body: JSON.stringify(chunk),
        });
        if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
        const tickets = ((await res.json()) as { data?: Ticket[] }).data ?? [];
        chunk.forEach((m, j) => {
          const t = tickets[j];
          if (t?.status === 'ok') return void result.sent++;
          result.failed++;
          if (t?.status === 'error' && t.details?.error === 'DeviceNotRegistered') result.invalidTokens.push(m.to);
        });
      } catch (e) {
        result.failed += chunk.length;
        this.opts.log?.(`push failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return result;
  }
}

/** Collects messages instead of sending; used in tests and when push is disabled. */
export class RecordingPushSender implements PushSender {
  readonly sent: PushMessage[] = [];
  invalid = new Set<string>();
  async send(messages: PushMessage[]): Promise<PushResult> {
    this.sent.push(...messages);
    const invalidTokens = messages.filter((m) => this.invalid.has(m.to)).map((m) => m.to);
    return { sent: messages.length - invalidTokens.length, failed: invalidTokens.length, invalidTokens };
  }
}
