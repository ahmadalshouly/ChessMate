import {
  ONLINE_BOT_LIMITS,
  clampBotRating,
  decodeImage,
  isBotStyle,
  isOnlineBotTag,
  validateOnlineBot,
  type BotGameResult,
  type OnlineBot,
  type OnlineBotView,
} from '@chessmate/core';
import {
  countOnlineBotGame,
  deleteOnlineBot,
  insertOnlineBot,
  listOnlineBots,
  onlineBot,
  updateOnlineBot,
  type Database,
  type OnlineBotRow,
} from '@chessmate/db';

export class BotError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

/**
 * Online computer opponents: bots staff create in the console, such as one in
 * a streamer's name. The app asks `list()` for the enabled ones and plays them
 * on the player's device; the server only holds who they are.
 *
 * Kept in memory and written through to the database, because the list is
 * read every time a player opens the vs-computer screen.
 */
export class BotService {
  private readonly db: Database;
  private readonly now: () => number;
  private readonly bots = new Map<string, OnlineBotRow>();

  constructor(opts: { db: Database; now?: () => number }) {
    this.db = opts.db;
    this.now = opts.now ?? Date.now;
  }

  async load() {
    for (const row of await listOnlineBots(this.db)) this.bots.set(row.id, row);
  }

  // ---------------------------------------------------------------- what players see

  /** Enabled bots, featured first, then weakest first. */
  list(): OnlineBot[] {
    return [...this.bots.values()]
      .filter((b) => b.enabled)
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.rating - b.rating || a.createdAt.getTime() - b.createdAt.getTime())
      .map((b) => this.toPublic(b));
  }

  /** The uploaded picture for GET /api/bots/:id/avatar (the console shows switched-off bots' too). */
  avatar(id: string): { mime: string; data: Uint8Array } | null {
    return decodeImage(this.bots.get(id)?.image);
  }

  /**
   * Counts a finished game. Fire and forget, like ad views: an unknown or
   * switched-off bot is ignored rather than an error.
   */
  async countGame(id: string, result: BotGameResult): Promise<void> {
    const row = this.bots.get(id);
    if (!row?.enabled) return;
    const next = {
      games: row.games + 1,
      playerWins: row.playerWins + (result === 'win' ? 1 : 0),
      botWins: row.botWins + (result === 'loss' ? 1 : 0),
      draws: row.draws + (result === 'draw' ? 1 : 0),
    };
    this.bots.set(id, { ...row, ...next });
    await countOnlineBotGame(this.db, id, result).catch((e) => console.warn('[bots] count failed', e));
  }

  // ---------------------------------------------------------------- console

  console(): OnlineBotView[] {
    return [...this.bots.values()].sort((a, b) => a.rating - b.rating || a.createdAt.getTime() - b.createdAt.getTime()).map((b) => this.toView(b));
  }

  async create(input: unknown, by: string): Promise<OnlineBotView> {
    if (this.bots.size >= ONLINE_BOT_LIMITS.max) throw new BotError(400, `At most ${ONLINE_BOT_LIMITS.max} online bots`);
    const v = validateOnlineBot(input);
    if ('error' in v) throw new BotError(400, v.error, v.field);
    const row = await insertOnlineBot(this.db, {
      name: v.value.name,
      tagline: v.value.tagline,
      rating: v.value.rating,
      style: v.value.style,
      tag: v.value.tag,
      url: v.value.url,
      image: v.value.image ?? null,
      imageUrl: v.value.imageUrl,
      featured: v.value.featured,
      enabled: v.value.enabled,
      createdBy: by,
      updatedAt: new Date(this.now()),
    });
    this.bots.set(row.id, row);
    return this.toView(row);
  }

  async update(id: string, input: unknown): Promise<OnlineBotView> {
    if (!this.bots.has(id)) throw new BotError(404, 'No such bot');
    const v = validateOnlineBot(input);
    if ('error' in v) throw new BotError(400, v.error, v.field);
    const row = await updateOnlineBot(this.db, id, {
      name: v.value.name,
      tagline: v.value.tagline,
      rating: v.value.rating,
      style: v.value.style,
      tag: v.value.tag,
      url: v.value.url,
      // An absent `image` keeps the stored one, so saving a form that never loaded it cannot wipe it.
      ...(v.value.image !== undefined ? { image: v.value.image } : {}),
      imageUrl: v.value.imageUrl,
      featured: v.value.featured,
      enabled: v.value.enabled,
      updatedAt: new Date(this.now()),
    });
    if (!row) throw new BotError(404, 'No such bot');
    this.bots.set(id, row);
    return this.toView(row);
  }

  /** Switches a bot on or off, or in and out of the featured row, without the whole form. */
  async setFlags(id: string, input: { enabled?: unknown; featured?: unknown }): Promise<OnlineBotView> {
    const current = this.bots.get(id);
    if (!current) throw new BotError(404, 'No such bot');
    const patch: Partial<OnlineBotRow> = { updatedAt: new Date(this.now()) };
    if (typeof input.enabled === 'boolean') patch.enabled = input.enabled;
    if (typeof input.featured === 'boolean') patch.featured = input.featured;
    const row = await updateOnlineBot(this.db, id, patch);
    if (!row) throw new BotError(404, 'No such bot');
    this.bots.set(id, row);
    return this.toView(row);
  }

  async remove(id: string): Promise<{ ok: true }> {
    if (!this.bots.has(id)) throw new BotError(404, 'No such bot');
    await deleteOnlineBot(this.db, id);
    this.bots.delete(id);
    return { ok: true };
  }

  /** Reads one bot straight from the database, for tests and tooling. */
  async reload(id: string): Promise<OnlineBotView | null> {
    const row = await onlineBot(this.db, id);
    if (!row) return null;
    this.bots.set(id, row);
    return this.toView(row);
  }

  // ---------------------------------------------------------------- shapes

  private avatarOf(b: OnlineBotRow): string | null {
    // The picture's path changes whenever the bot is saved, so the app never shows a stale cached one.
    return b.image ? `/api/bots/${b.id}/avatar?v=${b.updatedAt?.getTime() ?? b.createdAt.getTime()}` : b.imageUrl;
  }

  private toPublic(b: OnlineBotRow): OnlineBot {
    return {
      id: b.id,
      name: b.name,
      tagline: b.tagline,
      rating: clampBotRating(b.rating),
      style: isBotStyle(b.style) ? b.style : 'balanced',
      tag: isOnlineBotTag(b.tag) ? b.tag : null,
      url: b.url,
      avatar: this.avatarOf(b),
      featured: b.featured,
    };
  }

  private toView(b: OnlineBotRow): OnlineBotView {
    return {
      id: b.id,
      name: b.name,
      tagline: b.tagline,
      rating: b.rating,
      style: isBotStyle(b.style) ? b.style : 'balanced',
      tag: isOnlineBotTag(b.tag) ? b.tag : null,
      url: b.url,
      imageUrl: b.imageUrl,
      imagePath: b.image ? `/api/bots/${b.id}/avatar?v=${b.updatedAt?.getTime() ?? b.createdAt.getTime()}` : null,
      featured: b.featured,
      enabled: b.enabled,
      createdBy: b.createdBy,
      createdAt: b.createdAt.getTime(),
      updatedAt: b.updatedAt?.getTime() ?? null,
      games: b.games,
      playerWins: b.playerWins,
      botWins: b.botWins,
      draws: b.draws,
    };
  }
}
