import { MAINTENANCE_LIMITS, MAINTENANCE_OFF, maintenanceInForce, type MaintenanceState } from '@chessmate/core';
import { getAppSetting, setAppSetting, type Database } from '@chessmate/db';

import type { HttpRoute } from '../social/http';

export class MaintenanceInputError extends Error {}

/**
 * The web maintenance page: on/off, its title and text, and an optional
 * countdown. Stored in app_settings, so it survives restarts and a deploy;
 * staff change it from Admin → Maintenance without a new build. Without a
 * database it lives in memory only.
 */
export class MaintenanceSwitch {
  static readonly KEY = 'maintenance';
  private value: MaintenanceState = { ...MAINTENANCE_OFF };
  constructor(
    private readonly db: Database | null = null,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<this> {
    if (this.db) {
      const saved = await getAppSetting<Partial<MaintenanceState>>(this.db, MaintenanceSwitch.KEY);
      if (saved && typeof saved === 'object') this.value = { ...MAINTENANCE_OFF, ...saved };
    }
    return this;
  }

  get state(): MaintenanceState {
    return { ...this.value };
  }

  /** What every visitor may read: whether the page is in force and what it says. */
  publicView(): {
    active: boolean;
    title: string;
    description: string;
    endsAt: number | null;
    autoEnd: boolean;
  } {
    const s = this.value;
    return {
      active: maintenanceInForce(s, this.now()),
      title: s.title,
      description: s.description,
      endsAt: s.endsAt,
      autoEnd: s.autoEnd,
    };
  }

  /** Applies a change from the console. Throws MaintenanceInputError on bad input. */
  async update(input: Record<string, unknown>, by: string): Promise<MaintenanceState> {
    const next: MaintenanceState = { ...this.value };
    if ('active' in input) {
      if (typeof input.active !== 'boolean') throw new MaintenanceInputError('active must be true or false');
      next.active = input.active;
    }
    if ('title' in input) {
      if (typeof input.title !== 'string') throw new MaintenanceInputError('title must be text');
      next.title = input.title.trim().slice(0, MAINTENANCE_LIMITS.title);
    }
    if ('description' in input) {
      if (typeof input.description !== 'string') throw new MaintenanceInputError('description must be text');
      next.description = input.description.trim().slice(0, MAINTENANCE_LIMITS.description);
    }
    if ('endsAt' in input) {
      const v = input.endsAt;
      if (v === null) next.endsAt = null;
      else if (typeof v === 'number' && Number.isFinite(v) && v > 0) next.endsAt = Math.round(v);
      else throw new MaintenanceInputError('endsAt must be a time or null');
    }
    if ('autoEnd' in input) {
      if (typeof input.autoEnd !== 'boolean') throw new MaintenanceInputError('autoEnd must be true or false');
      next.autoEnd = input.autoEnd;
    }
    if (next.endsAt == null) next.autoEnd = false;
    // Switching on with a countdown that has already run out would open the site again at once.
    if (next.active && !this.value.active && next.autoEnd && next.endsAt != null && next.endsAt <= this.now()) {
      throw new MaintenanceInputError('The countdown has already run out: pick a later time');
    }
    next.updatedAt = this.now();
    next.updatedBy = by;
    if (this.db) await setAppSetting(this.db, MaintenanceSwitch.KEY, next);
    this.value = next;
    return { ...next };
  }
}

/**
 *   GET /api/maintenance   { active, title, description, endsAt, autoEnd }
 *
 * Read by the web app on start and every minute or two. Never cached, open to
 * every origin, needs no account.
 */
export function maintenanceRoutes(sw: MaintenanceSwitch): HttpRoute {
  return async (req, res, url) => {
    if (url.pathname !== '/api/maintenance') return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    if (req.method !== 'GET') {
      res.writeHead(405, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'GET only' }));
      return true;
    }
    res.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(sw.publicView()));
    return true;
  };
}
