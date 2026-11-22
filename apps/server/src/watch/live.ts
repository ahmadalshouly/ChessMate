import { channelHandle, type StreamChannel } from '@chessmate/core';

/**
 * Finds out whether streamers are live, with viewer counts, from the platforms
 * themselves, so streamers never have to switch "live" on by hand:
 *
 * - Twitch (Helix API): needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET (a free
 *   app at dev.twitch.tv). Live, title, viewers, start time, preview.
 * - YouTube: the channel's /live page tells whether it is live (no key needed);
 *   with YOUTUBE_API_KEY (free, Google Cloud) also title, viewers and start time.
 * - Kick: KICK_CLIENT_ID and KICK_CLIENT_SECRET (free app at kick.com) use
 *   Kick's public API; without them Kick's site API is tried, which may refuse.
 *
 * A platform that is not set up, or does not answer, gives "unknown": the
 * streamer's live state is then left as it is (they can still go live by hand).
 */

export interface DetectedLive {
  title: string;
  url: string;
  viewers: number | null;
  thumbnail: string | null;
  startedAt: number | null;
  /** "twitch:<login>", "youtube:<video id>" or "kick:<slug>". */
  embed: string | null;
}

/** Per streamer: live (with details), offline, or unknown (nothing could be checked). */
export type LiveResult = { state: 'live'; live: DetectedLive } | { state: 'offline' } | { state: 'unknown' };

export interface LiveCheckConfig {
  twitch?: { clientId: string; clientSecret: string };
  youtubeKey?: string;
  kick?: { clientId: string; clientSecret: string };
}

export function liveCheckConfigFromEnv(env: Record<string, string | undefined>): LiveCheckConfig {
  return {
    twitch: env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET ? { clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET } : undefined,
    youtubeKey: env.YOUTUBE_API_KEY || undefined,
    kick: env.KICK_CLIENT_ID && env.KICK_CLIENT_SECRET ? { clientId: env.KICK_CLIENT_ID, clientSecret: env.KICK_CLIENT_SECRET } : undefined,
  };
}

export type LiveFetcher = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const TIMEOUT_MS = 10_000;
/** YouTube pages are heavier than API calls: each channel is looked at this often at most. */
const YOUTUBE_EVERY_MS = 3 * 60_000;
const UA = 'Mozilla/5.0 (compatible; ChessMate live check; +https://chessmate.app)';

type ChannelResult = { state: 'live'; live: DetectedLive } | { state: 'offline' } | { state: 'unknown' };

export class LiveChecker {
  private twitchToken: { value: string; until: number } | null = null;
  private kickToken: { value: string; until: number } | null = null;
  private readonly youtubeSeen = new Map<string, { at: number; result: ChannelResult }>();

  constructor(
    private readonly config: LiveCheckConfig,
    private readonly fetcher: LiveFetcher = (u, i) => fetch(u, i),
    private readonly now: () => number = Date.now,
  ) {}

  /** Which platforms can be checked (for the startup log and settings). */
  platforms(): { twitch: boolean; youtube: 'full' | 'basic'; kick: 'full' | 'basic' } {
    return { twitch: !!this.config.twitch, youtube: this.config.youtubeKey ? 'full' : 'basic', kick: this.config.kick ? 'full' : 'basic' };
  }

  private async request(url: string, init: Parameters<LiveFetcher>[1] = {}): Promise<{ ok: boolean; status: number; body: string }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await this.fetcher(url, { ...init, signal: ac.signal });
      return { ok: res.ok, status: res.status, body: await res.text() };
    } finally {
      clearTimeout(timer);
    }
  }

  private async json(url: string, init: Parameters<LiveFetcher>[1] = {}): Promise<unknown> {
    const r = await this.request(url, init);
    if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
    return JSON.parse(r.body) as unknown;
  }

  /** Checks every streamer's channels; the first live channel wins (most viewers if several). */
  async check(streamers: { userId: string; channels: StreamChannel[] }[]): Promise<Map<string, LiveResult>> {
    const byChannel = new Map<string, ChannelResult>();
    const twitch = new Set<string>();
    const kick = new Set<string>();
    const youtube = new Set<string>();
    for (const s of streamers) {
      for (const c of s.channels) {
        const h = channelHandle(c.url);
        if (!h) continue;
        (h.platform === 'twitch' ? twitch : h.platform === 'kick' ? kick : youtube).add(h.handle);
      }
    }
    await Promise.all([
      this.checkTwitch([...twitch]).then((m) => m.forEach((v, k) => byChannel.set(`twitch:${k}`, v))),
      this.checkKick([...kick]).then((m) => m.forEach((v, k) => byChannel.set(`kick:${k}`, v))),
      this.checkYoutube([...youtube]).then((m) => m.forEach((v, k) => byChannel.set(`youtube:${k}`, v))),
    ]);
    const out = new Map<string, LiveResult>();
    for (const s of streamers) {
      const results = s.channels.map((c) => {
        const h = channelHandle(c.url);
        return h ? (byChannel.get(`${h.platform}:${h.handle}`) ?? { state: 'unknown' as const }) : null;
      });
      const live = results.filter((r): r is { state: 'live'; live: DetectedLive } => r?.state === 'live').sort((a, b) => (b.live.viewers ?? -1) - (a.live.viewers ?? -1))[0];
      if (live) out.set(s.userId, live);
      else if (results.some((r) => r?.state === 'offline') && !results.some((r) => r?.state === 'unknown')) out.set(s.userId, { state: 'offline' });
      else out.set(s.userId, { state: 'unknown' });
    }
    return out;
  }

  // Twitch -----------------------------------------------------------------

  private async twitchAuth(): Promise<string> {
    if (this.twitchToken && this.twitchToken.until > this.now()) return this.twitchToken.value;
    const c = this.config.twitch!;
    const body = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'client_credentials' }).toString();
    const r = (await this.json('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })) as { access_token?: string; expires_in?: number };
    if (!r.access_token) throw new Error('Twitch gave no token');
    this.twitchToken = { value: r.access_token, until: this.now() + Math.max(60, (r.expires_in ?? 3600) - 300) * 1000 };
    return r.access_token;
  }

  private async checkTwitch(logins: string[]): Promise<Map<string, ChannelResult>> {
    const out = new Map<string, ChannelResult>();
    if (!logins.length) return out;
    if (!this.config.twitch) {
      for (const l of logins) out.set(l, { state: 'unknown' });
      return out;
    }
    try {
      const token = await this.twitchAuth();
      for (let i = 0; i < logins.length; i += 100) {
        const batch = logins.slice(i, i + 100);
        const qs = batch.map((l) => `user_login=${encodeURIComponent(l)}`).join('&');
        const r = (await this.json(`https://api.twitch.tv/helix/streams?first=100&${qs}`, { headers: { 'client-id': this.config.twitch.clientId, authorization: `Bearer ${token}` } })) as {
          data?: { user_login?: string; type?: string; title?: string; viewer_count?: number; started_at?: string; thumbnail_url?: string }[];
        };
        for (const l of batch) out.set(l, { state: 'offline' });
        for (const s of r.data ?? []) {
          const login = s.user_login?.toLowerCase();
          if (!login || s.type !== 'live') continue;
          out.set(login, {
            state: 'live',
            live: {
              title: s.title ?? '',
              url: `https://www.twitch.tv/${login}`,
              viewers: typeof s.viewer_count === 'number' ? s.viewer_count : null,
              thumbnail: s.thumbnail_url ? s.thumbnail_url.replace('{width}', '640').replace('{height}', '360') : null,
              startedAt: s.started_at ? Date.parse(s.started_at) || null : null,
              embed: `twitch:${login}`,
            },
          });
        }
      }
    } catch (e) {
      this.twitchToken = null;
      console.warn('twitch live check failed:', e instanceof Error ? e.message : e);
      for (const l of logins) if (!out.has(l) || out.get(l)!.state === 'offline') out.set(l, { state: 'unknown' });
    }
    return out;
  }

  // Kick -------------------------------------------------------------------

  private async kickAuth(): Promise<string> {
    if (this.kickToken && this.kickToken.until > this.now()) return this.kickToken.value;
    const c = this.config.kick!;
    const body = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'client_credentials' }).toString();
    const r = (await this.json('https://id.kick.com/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })) as { access_token?: string; expires_in?: number };
    if (!r.access_token) throw new Error('Kick gave no token');
    this.kickToken = { value: r.access_token, until: this.now() + Math.max(60, (r.expires_in ?? 3600) - 300) * 1000 };
    return r.access_token;
  }

  private async checkKick(slugs: string[]): Promise<Map<string, ChannelResult>> {
    const out = new Map<string, ChannelResult>();
    if (!slugs.length) return out;
    if (this.config.kick) {
      try {
        const token = await this.kickAuth();
        for (let i = 0; i < slugs.length; i += 50) {
          const batch = slugs.slice(i, i + 50);
          const qs = batch.map((s) => `slug=${encodeURIComponent(s)}`).join('&');
          const r = (await this.json(`https://api.kick.com/public/v1/channels?${qs}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } })) as {
            data?: { slug?: string; stream_title?: string; stream?: { is_live?: boolean; viewer_count?: number; start_time?: string; thumbnail?: string } }[];
          };
          for (const s of batch) out.set(s, { state: 'offline' });
          for (const ch of r.data ?? []) {
            const slug = ch.slug?.toLowerCase();
            if (!slug || !ch.stream?.is_live) continue;
            out.set(slug, { state: 'live', live: kickLive(slug, ch.stream_title, ch.stream.viewer_count, ch.stream.start_time, ch.stream.thumbnail) });
          }
        }
        return out;
      } catch (e) {
        this.kickToken = null;
        console.warn('kick live check failed:', e instanceof Error ? e.message : e);
      }
    }
    // Without an app: Kick's own site API (may refuse servers).
    for (const slug of slugs) {
      try {
        const r = (await this.json(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, { headers: { 'user-agent': UA, accept: 'application/json' } })) as {
          livestream?: { is_live?: boolean; session_title?: string; viewer_count?: number; created_at?: string; thumbnail?: { url?: string } } | null;
        };
        const l = r.livestream;
        out.set(slug, l && l.is_live !== false ? { state: 'live', live: kickLive(slug, l.session_title, l.viewer_count, l.created_at, l.thumbnail?.url) } : { state: 'offline' });
      } catch {
        out.set(slug, { state: 'unknown' });
      }
    }
    return out;
  }

  // YouTube ----------------------------------------------------------------

  private async checkYoutube(handles: string[]): Promise<Map<string, ChannelResult>> {
    const out = new Map<string, ChannelResult>();
    for (const handle of handles) {
      const seen = this.youtubeSeen.get(handle);
      if (seen && this.now() - seen.at < YOUTUBE_EVERY_MS) {
        out.set(handle, seen.result);
        continue;
      }
      let result: ChannelResult;
      try {
        result = await this.youtubeChannel(handle);
      } catch {
        result = { state: 'unknown' };
      }
      this.youtubeSeen.set(handle, { at: this.now(), result });
      out.set(handle, result);
    }
    return out;
  }

  private async youtubeChannel(handle: string): Promise<ChannelResult> {
    const path = handle.startsWith('@') ? handle : handle.startsWith('UC') ? `channel/${handle}` : handle;
    // The channel's /live page shows the current live video when there is one.
    // SOCS skips the cookie consent page YouTube shows in Europe.
    const page = await this.request(`https://www.youtube.com/${path}/live`, { headers: { 'user-agent': UA, 'accept-language': 'en', cookie: 'SOCS=CAI; CONSENT=YES+1' } });
    if (!page.ok) return page.status === 404 ? { state: 'offline' } : { state: 'unknown' };
    const html = page.body;
    const video = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/.exec(html)?.[1];
    const liveNow = /"isLiveNow":\s*true/.test(html) || /"isLive":\s*true/.test(html);
    if (!video || !liveNow) return { state: 'offline' };
    const fallbackTitle = decodeHtml(/<meta name="title" content="([^"]*)"/.exec(html)?.[1] ?? '');
    const live: DetectedLive = {
      title: fallbackTitle,
      url: `https://www.youtube.com/watch?v=${video}`,
      viewers: null,
      thumbnail: `https://i.ytimg.com/vi/${video}/hqdefault_live.jpg`,
      startedAt: null,
      embed: `youtube:${video}`,
    };
    if (this.config.youtubeKey) {
      try {
        const r = (await this.json(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${video}&key=${encodeURIComponent(this.config.youtubeKey)}`)) as {
          items?: { snippet?: { title?: string; liveBroadcastContent?: string }; liveStreamingDetails?: { concurrentViewers?: string; actualStartTime?: string; actualEndTime?: string } }[];
        };
        const item = r.items?.[0];
        if (item?.liveStreamingDetails?.actualEndTime) return { state: 'offline' };
        if (item?.snippet?.title) live.title = item.snippet.title;
        const viewers = Number(item?.liveStreamingDetails?.concurrentViewers);
        if (Number.isFinite(viewers)) live.viewers = viewers;
        const started = Date.parse(item?.liveStreamingDetails?.actualStartTime ?? '');
        if (Number.isFinite(started)) live.startedAt = started;
      } catch (e) {
        console.warn('youtube live details failed:', e instanceof Error ? e.message : e);
      }
    }
    return { state: 'live', live };
  }
}

function kickLive(slug: string, title: string | undefined, viewers: number | undefined, start: string | undefined, thumbnail: string | undefined): DetectedLive {
  const started = start ? Date.parse(start.includes('T') ? start : start.replace(' ', 'T') + 'Z') : NaN;
  return {
    title: title ?? '',
    url: `https://kick.com/${slug}`,
    viewers: typeof viewers === 'number' ? viewers : null,
    thumbnail: thumbnail && /^https:\/\//.test(thumbnail) ? thumbnail : null,
    startedAt: Number.isFinite(started) ? started : null,
    embed: `kick:${slug}`,
  };
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
