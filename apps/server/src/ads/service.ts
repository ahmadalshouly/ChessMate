import {
  AD_SPOTS,
  decodeImage,
  isAdSpot,
  isLive,
  validateAdPlacement,
  type AdCreative,
  type AdPlacementView,
  type AdSpotId,
  type AdSpotState,
} from '@chessmate/core';
import {
  adPlacement,
  countAdEvent,
  deleteAdPlacement,
  insertAdPlacement,
  listAdPlacements,
  listAdSpots,
  updateAdPlacement,
  upsertAdSpot,
  type AdPlacementRow,
  type AdSpotRow,
  type Database,
} from '@chessmate/db';

export class AdError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

/** What the console sees: every spot with its switch, and every placement. */
export interface AdConsole {
  spots: AdSpotState[];
  placements: AdPlacementView[];
}

/**
 * Sponsored spots. Staff switch a spot on and place a sponsor on it for a
 * period; the app asks `creatives()` what to show.
 *
 * Spots and placements are held in memory and written through to the database,
 * because `creatives()` runs on screens players open constantly and must not
 * hit the database each time.
 */
export class AdService {
  private readonly db: Database;
  private readonly now: () => number;
  private readonly spots = new Map<AdSpotId, AdSpotRow>();
  private readonly placements = new Map<string, AdPlacementRow>();

  constructor(opts: { db: Database; now?: () => number }) {
    this.db = opts.db;
    this.now = opts.now ?? Date.now;
  }

  async load() {
    for (const row of await listAdSpots(this.db)) if (isAdSpot(row.spot)) this.spots.set(row.spot, row);
    for (const row of await listAdPlacements(this.db)) this.placements.set(row.id, row);
  }

  // ---------------------------------------------------------------- what players see

  /**
   * The live sponsor on each switched-on spot, newest placement first when
   * several overlap. Spots that are off, or empty, are simply absent.
   */
  creatives(): AdCreative[] {
    const now = this.now();
    const out: AdCreative[] = [];
    for (const spot of AD_SPOTS) {
      if (!this.spots.get(spot)?.enabled) continue;
      const live = [...this.placements.values()]
        .filter((p) => p.spot === spot && isLive(this.toLive(p), now))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      if (live) out.push(this.toCreative(live));
    }
    return out;
  }

  /** The stored image for GET /api/ads/:id/image. */
  image(id: string): { mime: string; data: Uint8Array } | null {
    return decodeImage(this.placements.get(id)?.image);
  }

  /**
   * Counts a view or a tap. Fire and forget: a lost count must never fail the
   * request the player is making, and an unknown id is ignored rather than an
   * error, so an old creative left on a screen cannot produce noise.
   */
  async count(id: string, kind: 'impression' | 'click'): Promise<void> {
    const row = this.placements.get(id);
    if (!row) return;
    const next = kind === 'click' ? { clicks: row.clicks + 1 } : { impressions: row.impressions + 1 };
    this.placements.set(id, { ...row, ...next });
    await countAdEvent(this.db, id, kind).catch((e) => console.warn('[ads] count failed', e));
  }

  // ---------------------------------------------------------------- console

  console(): AdConsole {
    return {
      spots: AD_SPOTS.map((spot) => {
        const row = this.spots.get(spot);
        return {
          spot,
          enabled: row?.enabled ?? false,
          note: row?.note ?? null,
          updatedBy: row?.updatedBy ?? null,
          updatedAt: row?.updatedAt?.getTime() ?? null,
        };
      }),
      placements: [...this.placements.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((p) => this.toView(p)),
    };
  }

  /** Switches a spot on or off and saves its note. */
  async setSpot(spot: string, input: { enabled?: unknown; note?: unknown }, by: string): Promise<AdSpotState> {
    if (!isAdSpot(spot)) throw new AdError(404, 'No such spot');
    const current = this.spots.get(spot);
    const enabled = typeof input.enabled === 'boolean' ? input.enabled : (current?.enabled ?? false);
    const note = input.note === undefined ? (current?.note ?? null) : typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 500) : null;
    const row = await upsertAdSpot(this.db, { spot, enabled, note, updatedBy: by, updatedAt: new Date(this.now()) });
    this.spots.set(spot, row);
    return { spot, enabled: row.enabled, note: row.note, updatedBy: row.updatedBy, updatedAt: row.updatedAt?.getTime() ?? null };
  }

  async createPlacement(input: unknown, by: string): Promise<AdPlacementView> {
    const v = validateAdPlacement(input, this.now());
    if ('error' in v) throw new AdError(400, v.error, v.field);
    const row = await insertAdPlacement(this.db, {
      spot: v.value.spot,
      sponsor: v.value.sponsor,
      title: v.value.title,
      body: v.value.body,
      url: v.value.url,
      image: v.value.image ?? null,
      imageUrl: v.value.imageUrl,
      startsAt: new Date(v.value.startsAt),
      endsAt: new Date(v.value.endsAt),
      applicationId: v.value.applicationId,
      createdBy: by,
    });
    this.placements.set(row.id, row);
    return this.toView(row);
  }

  async updatePlacement(id: string, input: unknown, by: string): Promise<AdPlacementView> {
    const current = this.placements.get(id);
    if (!current) throw new AdError(404, 'No such placement');
    const given = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const v = validateAdPlacement({ ...given, spot: given.spot ?? current.spot }, this.now());
    if ('error' in v) throw new AdError(400, v.error, v.field);
    const row = await updateAdPlacement(this.db, id, {
      spot: v.value.spot,
      sponsor: v.value.sponsor,
      title: v.value.title,
      body: v.value.body,
      url: v.value.url,
      // An absent `image` keeps the stored one, so saving a form that never loaded it cannot wipe it.
      ...(v.value.image !== undefined ? { image: v.value.image } : {}),
      imageUrl: v.value.imageUrl,
      startsAt: new Date(v.value.startsAt),
      endsAt: new Date(v.value.endsAt),
      createdBy: current.createdBy ?? by,
    });
    if (!row) throw new AdError(404, 'No such placement');
    this.placements.set(id, row);
    return this.toView(row);
  }

  /** Takes a placement down early, or puts a stopped one back on. */
  async stopPlacement(id: string, stopped: boolean): Promise<AdPlacementView> {
    if (!this.placements.has(id)) throw new AdError(404, 'No such placement');
    const row = await updateAdPlacement(this.db, id, { stopped });
    if (!row) throw new AdError(404, 'No such placement');
    this.placements.set(id, row);
    return this.toView(row);
  }

  async deletePlacement(id: string): Promise<{ ok: true }> {
    if (!this.placements.has(id)) throw new AdError(404, 'No such placement');
    await deleteAdPlacement(this.db, id);
    this.placements.delete(id);
    return { ok: true };
  }

  /** Reads one placement straight from the database, for tests and tooling. */
  async reload(id: string): Promise<AdPlacementView | null> {
    const row = await adPlacement(this.db, id);
    if (!row) return null;
    this.placements.set(id, row);
    return this.toView(row);
  }

  // ---------------------------------------------------------------- shapes

  private toLive(p: AdPlacementRow) {
    return { startsAt: p.startsAt.getTime(), endsAt: p.endsAt.getTime(), stopped: p.stopped };
  }

  private toCreative(p: AdPlacementRow): AdCreative {
    return {
      id: p.id,
      spot: p.spot as AdSpotId,
      sponsor: p.sponsor,
      title: p.title,
      body: p.body,
      url: p.url,
      image: p.image ? `/api/ads/${p.id}/image` : p.imageUrl,
      endsAt: p.endsAt.getTime(),
    };
  }

  private toView(p: AdPlacementRow): AdPlacementView {
    return {
      id: p.id,
      spot: p.spot as AdSpotId,
      sponsor: p.sponsor,
      title: p.title,
      body: p.body,
      url: p.url,
      imageUrl: p.imageUrl,
      imagePath: p.image ? `/api/ads/${p.id}/image` : null,
      startsAt: p.startsAt.getTime(),
      endsAt: p.endsAt.getTime(),
      stopped: p.stopped,
      applicationId: p.applicationId,
      createdBy: p.createdBy,
      createdAt: p.createdAt.getTime(),
      impressions: p.impressions,
      clicks: p.clicks,
    };
  }
}
