/**
 * Minimal Expo push client (https://docs.expo.dev/push-notifications/sending-notifications/).
 * No SDK dependency: one POST per 100 messages. Tokens that Expo reports as
 * DeviceNotRegistered are handed back so the caller can delete them.
 *
 * Expo answers a send with a "ticket" (accepted or not); whether Apple or
 * Google then delivered it comes later as a "receipt". Receipts are where a
 * missing FCM key or APNs key shows up (InvalidCredentials), so the sender
 * checks them every few minutes and keeps a short error log for the admin
 * console.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const CHUNK = 100;
const RECEIPT_CHUNK = 300;
/** Expo asks to wait about 15 minutes before reading receipts; they are kept for a day. */
const RECEIPT_DELAY_MS = 15 * 60_000;
const RECEIPT_MAX_AGE_MS = 20 * 60 * 60_000;
const MAX_PENDING_RECEIPTS = 50_000;

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
  /** Delivery priority; "high" wakes Android devices in Doze. */
  priority?: 'default' | 'normal' | 'high';
  /** Not sent to Expo: the device platform, for the error log. */
  platform?: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Tokens to forget (uninstalled app, revoked permission). */
  invalidTokens: string[];
  /** Per message, in order: true when Expo accepted it. */
  ok: boolean[];
}

export interface PushHealthSnapshot {
  sending: boolean;
  accessToken: boolean;
  errors: { at: number; code: string; message: string; platform: string | null; count: number }[];
  totals: { accepted: number; delivered: number; failed: number };
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult>;
  /** Delivery health for the console. */
  health?(): PushHealthSnapshot;
  /** Reads delivery receipts that are due; tokens Expo says are dead go to `onInvalidToken`. */
  checkReceipts?(force?: boolean): Promise<void>;
  onInvalidToken?: (token: string) => void;
}

export const isExpoPushToken = (t: unknown): t is string =>
  typeof t === 'string' && t.length < 256 && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);

type Ticket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };
type Receipt = { status: 'ok' } | { status: 'error'; message?: string; details?: { error?: string } };

/** What each Expo error code means, in words staff can act on. */
export const PUSH_ERROR_HELP: Record<string, string> = {
  InvalidCredentials:
    'Expo has no valid push key for this app: upload an FCM V1 service account key (Android) or an APNs key (iOS) with `eas credentials`. See docs/PUSH_NOTIFICATIONS.md.',
  DeviceNotRegistered: 'The app was removed or push was turned off on that device. The token was deleted.',
  MessageTooBig: 'The notification was over 4 KB.',
  MessageRateExceeded: 'Too many messages to one device. Send less often.',
  MismatchSenderId: 'The FCM key in Expo belongs to a different Firebase project than google-services.json in the build.',
  InvalidProviderToken: 'The APNs key in Expo is invalid or revoked. Upload a new one with `eas credentials`.',
  HTTP: 'Could not reach Expo push service.',
};

/** Small rolling error log: one line per code and platform, with a count. */
class HealthLog {
  errors = new Map<string, PushHealthSnapshot['errors'][number]>();
  totals = { accepted: 0, delivered: 0, failed: 0 };
  record(code: string, message: string, platform: string | null, at: number) {
    const key = `${code}:${platform ?? ''}`;
    const cur = this.errors.get(key);
    if (cur) {
      cur.count++;
      cur.at = at;
      cur.message = message;
    } else {
      this.errors.set(key, { at, code, message, platform, count: 1 });
      if (this.errors.size > 20) {
        const oldest = [...this.errors.entries()].sort((a, b) => a[1].at - b[1].at)[0]!;
        this.errors.delete(oldest[0]);
      }
    }
  }
  list() {
    return [...this.errors.values()].sort((a, b) => b.at - a.at).map((e) => ({ ...e }));
  }
}

const wire = ({ platform: _p, ...m }: PushMessage) => m;

export class ExpoPushSender implements PushSender {
  private readonly log = new HealthLog();
  /** Ticket id → the message's token, for reading receipts later. */
  private pending = new Map<string, { token: string; platform: string | null; at: number }>();
  onInvalidToken?: (token: string) => void;

  constructor(
    private readonly opts: { accessToken?: string; fetch?: typeof fetch; log?: (msg: string) => void; now?: () => number } = {},
  ) {}

  private get now() {
    return this.opts.now?.() ?? Date.now();
  }

  private headers() {
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(this.opts.accessToken ? { authorization: `Bearer ${this.opts.accessToken}` } : {}),
    };
  }

  async send(messages: PushMessage[]): Promise<PushResult> {
    const result: PushResult = { sent: 0, failed: 0, invalidTokens: [], ok: messages.map(() => false) };
    const doFetch = this.opts.fetch ?? fetch;
    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      try {
        const res = await doFetch(EXPO_PUSH_URL, { method: 'POST', headers: this.headers(), body: JSON.stringify(chunk.map(wire)) });
        if (!res.ok) throw new Error(`Expo push HTTP ${res.status}${res.status === 401 ? ' (EXPO_ACCESS_TOKEN missing or wrong while enhanced push security is on)' : ''}`);
        const tickets = ((await res.json()) as { data?: Ticket[] }).data ?? [];
        chunk.forEach((m, j) => {
          const t = tickets[j];
          if (t?.status === 'ok') {
            result.sent++;
            result.ok[i + j] = true;
            this.log.totals.accepted++;
            if (this.pending.size < MAX_PENDING_RECEIPTS) this.pending.set(t.id, { token: m.to, platform: m.platform ?? null, at: this.now });
            return;
          }
          result.failed++;
          this.log.totals.failed++;
          const code = (t?.status === 'error' && t.details?.error) || 'Unknown';
          this.log.record(code, t?.status === 'error' ? t.message : 'No ticket', m.platform ?? null, this.now);
          if (code === 'DeviceNotRegistered') result.invalidTokens.push(m.to);
        });
      } catch (e) {
        result.failed += chunk.length;
        this.log.totals.failed += chunk.length;
        const msg = e instanceof Error ? e.message : String(e);
        this.log.record('HTTP', msg, null, this.now);
        this.opts.log?.(`push failed: ${msg}`);
      }
    }
    return result;
  }

  async checkReceipts(force = false): Promise<void> {
    const now = this.now;
    const due: string[] = [];
    for (const [id, p] of this.pending) {
      if (now - p.at > RECEIPT_MAX_AGE_MS) this.pending.delete(id);
      else if (force || now - p.at >= RECEIPT_DELAY_MS) due.push(id);
    }
    const doFetch = this.opts.fetch ?? fetch;
    for (let i = 0; i < due.length; i += RECEIPT_CHUNK) {
      const ids = due.slice(i, i + RECEIPT_CHUNK);
      try {
        const res = await doFetch(EXPO_RECEIPTS_URL, { method: 'POST', headers: this.headers(), body: JSON.stringify({ ids }) });
        if (!res.ok) throw new Error(`Expo receipts HTTP ${res.status}`);
        const receipts = ((await res.json()) as { data?: Record<string, Receipt> }).data ?? {};
        for (const id of ids) {
          const r = receipts[id];
          const p = this.pending.get(id);
          if (!r || !p) continue; // not ready yet; try again next round
          this.pending.delete(id);
          if (r.status === 'ok') {
            this.log.totals.delivered++;
            continue;
          }
          this.log.totals.failed++;
          const code = r.details?.error ?? 'Unknown';
          this.log.record(code, r.message ?? code, p.platform, now);
          if (code === 'DeviceNotRegistered') this.onInvalidToken?.(p.token);
          if (code === 'InvalidCredentials' || code === 'MismatchSenderId' || code === 'InvalidProviderToken') {
            this.opts.log?.(`push not delivered (${code}) on ${p.platform ?? 'a device'}: ${PUSH_ERROR_HELP[code]}`);
          }
        }
      } catch (e) {
        this.opts.log?.(`push receipts failed: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
  }

  health(): PushHealthSnapshot {
    return { sending: true, accessToken: !!this.opts.accessToken, errors: this.log.list(), totals: { ...this.log.totals } };
  }
}

/** Collects messages instead of sending; used in tests and when push is disabled. */
export class RecordingPushSender implements PushSender {
  readonly sent: PushMessage[] = [];
  invalid = new Set<string>();
  onInvalidToken?: (token: string) => void;
  async send(messages: PushMessage[]): Promise<PushResult> {
    this.sent.push(...messages);
    const ok = messages.map((m) => !this.invalid.has(m.to));
    const invalidTokens = messages.filter((m) => this.invalid.has(m.to)).map((m) => m.to);
    return { sent: messages.length - invalidTokens.length, failed: invalidTokens.length, invalidTokens, ok };
  }
  health(): PushHealthSnapshot {
    return { sending: false, accessToken: false, errors: [], totals: { accepted: this.sent.length, delivered: 0, failed: 0 } };
  }
}
