import type { AnalyticsCount, AnalyticsDay, AnalyticsEventName, AnalyticsPlatform, AnalyticsProps, AnalyticsReport } from '@chessmate/core';
import { lt, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../client';
import { analyticsEvents } from '../schema';

export type AnalyticsEventInsert = typeof analyticsEvents.$inferInsert;

export async function insertAnalyticsEvents(db: Database, rows: AnalyticsEventInsert[]): Promise<void> {
  if (rows.length) await db.insert(analyticsEvents).values(rows);
}

/** Deletes events from before `before`; returns how many went. */
export async function pruneAnalyticsEvents(db: Database, before: Date): Promise<number> {
  const out = await db.delete(analyticsEvents).where(lt(analyticsEvents.at, before)).returning({ id: analyticsEvents.id });
  return out.length;
}

/** Deletes every event a device sent (the visitor withdrew consent and asked us to forget it). */
export async function deleteAnalyticsDevice(db: Database, deviceId: string): Promise<number> {
  const out = await db
    .delete(analyticsEvents)
    .where(sql`${analyticsEvents.deviceId} = ${deviceId}`)
    .returning({ id: analyticsEvents.id });
  return out.length;
}

// Raw SQL keeps the report to a handful of grouped queries. Both drivers (node-postgres and PGlite) answer with `rows`.
async function rows<T>(db: Database, q: SQL): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows: T[] };
  return r.rows ?? [];
}
const int = (v: unknown) => Number(v ?? 0) || 0;
const counts = (list: { key: string | null; count: unknown; devices?: unknown }[]): AnalyticsCount[] =>
  list.map((r) => ({ key: r.key ?? 'unknown', count: int(r.count), ...(r.devices !== undefined ? { devices: int(r.devices) } : null) }));

export type AnalyticsFacts = Omit<AnalyticsReport, 'days' | 'generatedAt' | 'live'>;

/**
 * Everything the admin analytics page shows, for the last `days` days (UTC).
 * The top half comes from the game's own tables, so it counts every player;
 * `app` comes from analytics_events, which only holds visitors who consented.
 */
export async function analyticsReport(db: Database, opts: { now?: Date; days: number }): Promise<AnalyticsFacts> {
  const now = opts.now ?? new Date();
  const DAY = 24 * 3600_000;
  const days = Math.max(1, Math.min(366, Math.round(opts.days)));
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY);
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const day = (col: SQL) => sql`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD')`;

  const [
    active,
    totals,
    retention,
    methods,
    categories,
    openings,
    countries,
    dSignups,
    dGames,
    dPlayers,
    dPuzzles,
    dReviews,
    dApp,
    app,
    sessions,
    platforms,
    screens,
    topEvents,
    versions,
    languages,
    funnel,
    recent,
    sponsors,
  ] = await Promise.all([
    rows<{ day: unknown; week: unknown; month: unknown; total: unknown }>(
      db,
      sql`select
        count(*) filter (where coalesce(last_seen_at, created_at) >= ${ago(DAY)}) as day,
        count(*) filter (where coalesce(last_seen_at, created_at) >= ${ago(7 * DAY)}) as week,
        count(*) filter (where coalesce(last_seen_at, created_at) >= ${ago(30 * DAY)}) as month,
        count(*) as total
      from users where deleted_at is null`,
    ),
    rows<Record<string, unknown>>(
      db,
      sql`select
        (select count(*) from users where deleted_at is null and created_at >= ${since}) as signups,
        (select count(*) from games where started_at >= ${since} and status <> 'aborted') as games,
        (select count(*) from games where started_at >= ${since} and status <> 'aborted' and rated) as rated_games,
        (select count(*) from puzzle_attempts where created_at >= ${since}) as puzzles,
        (select count(*) from puzzle_attempts where created_at >= ${since} and solved) as puzzles_solved,
        (select count(*) from game_reviews where created_at >= ${since}) as reviews,
        (select count(*) from tournament_players where joined_at >= ${since}) as tournament_joins,
        (select count(*) from direct_messages where created_at >= ${since} and kind = 'user') as messages`,
    ),
    // "Came back": seen again at least a day (a week) after the account was made.
    rows<{ cohort: unknown; day1: unknown; day7: unknown }>(
      db,
      sql`select count(*) as cohort,
        count(*) filter (where last_seen_at >= created_at + interval '1 day') as day1,
        count(*) filter (where last_seen_at >= created_at + interval '7 days') as day7
      from users where deleted_at is null and created_at >= ${since}`,
    ),
    rows<{ key: string | null; count: unknown }>(
      db,
      sql`select coalesce((select o.provider from oauth_accounts o where o.user_id = u.id order by o.created_at limit 1),
          case when u.password_hash is not null then 'email' else 'other' end) as key, count(*) as count
      from users u where u.deleted_at is null and u.created_at >= ${since} group by 1 order by 2 desc`,
    ),
    rows<{ key: string | null; count: unknown }>(
      db,
      sql`select time_category::text as key, count(*) as count from games
      where started_at >= ${since} and status <> 'aborted' group by 1 order by 2 desc`,
    ),
    rows<{ key: string | null; count: unknown }>(
      db,
      sql`select opening_name as key, count(*) as count from games
      where started_at >= ${since} and status = 'finished' and opening_name is not null group by 1 order by 2 desc limit 10`,
    ),
    rows<{ key: string | null; count: unknown }>(
      db,
      sql`select upper(p.country) as key, count(*) as count from user_profiles p join users u on u.id = p.user_id
      where u.deleted_at is null and p.country is not null and p.country <> '' group by 1 order by 2 desc limit 12`,
    ),
    rows<{ day: string; n: unknown }>(db, sql`select ${day(sql`created_at`)} as day, count(*) as n from users where deleted_at is null and created_at >= ${since} group by 1`),
    rows<{ day: string; n: unknown }>(db, sql`select ${day(sql`started_at`)} as day, count(*) as n from games where started_at >= ${since} and status <> 'aborted' group by 1`),
    rows<{ day: string; n: unknown }>(
      db,
      sql`select day, count(distinct uid) as n from (
        select ${day(sql`started_at`)} as day, white_user_id as uid from games where started_at >= ${since} and status <> 'aborted'
        union all
        select ${day(sql`started_at`)} as day, black_user_id as uid from games where started_at >= ${since} and status <> 'aborted'
      ) x where uid is not null group by day`,
    ),
    rows<{ day: string; n: unknown }>(db, sql`select ${day(sql`created_at`)} as day, count(*) as n from puzzle_attempts where created_at >= ${since} group by 1`),
    rows<{ day: string; n: unknown }>(db, sql`select ${day(sql`created_at`)} as day, count(*) as n from game_reviews where created_at >= ${since} group by 1`),
    rows<{ day: string; devices: unknown; sessions: unknown }>(
      db,
      sql`select ${day(sql`at`)} as day, count(distinct device_id) as devices, count(distinct session_id) as sessions
      from analytics_events where at >= ${since} group by 1`,
    ),
    rows<{ devices: unknown; sessions: unknown; events: unknown }>(
      db,
      sql`select count(distinct device_id) as devices, count(distinct session_id) as sessions, count(*) as events from analytics_events where at >= ${since}`,
    ),
    rows<{ median: unknown }>(
      db,
      sql`select coalesce(percentile_cont(0.5) within group (order by secs), 0) as median from (
        select extract(epoch from max(at) - min(at)) as secs from analytics_events where at >= ${since} group by session_id
      ) s`,
    ),
    rows<{ key: string; count: unknown }>(db, sql`select platform as key, count(distinct device_id) as count from analytics_events where at >= ${since} group by 1 order by 2 desc`),
    rows<{ key: string; count: unknown; devices: unknown }>(
      db,
      sql`select screen as key, count(*) as count, count(distinct device_id) as devices from analytics_events
      where at >= ${since} and name = 'screen_view' and screen is not null group by 1 order by 2 desc limit 25`,
    ),
    rows<{ key: string; count: unknown; devices: unknown }>(
      db,
      sql`select name as key, count(*) as count, count(distinct device_id) as devices from analytics_events
      where at >= ${since} and name <> 'screen_view' group by 1 order by 2 desc`,
    ),
    rows<{ key: string | null; count: unknown }>(
      db,
      sql`select app_version as key, count(distinct device_id) as count from analytics_events where at >= ${since} group by 1 order by 2 desc limit 8`,
    ),
    rows<{ key: string | null; count: unknown }>(
      db,
      sql`select lang as key, count(distinct device_id) as count from analytics_events where at >= ${since} group by 1 order by 2 desc limit 13`,
    ),
    rows<{ opened: unknown; signed_up: unknown; started: unknown; finished: unknown }>(
      db,
      sql`select
        count(distinct device_id) filter (where name = 'app_open') as opened,
        count(distinct device_id) filter (where name = 'sign_up') as signed_up,
        count(distinct device_id) filter (where name in ('game_start', 'computer_game_start')) as started,
        count(distinct device_id) filter (where name = 'game_end') as finished
      from analytics_events where at >= ${since}`,
    ),
    rows<{ at: Date | string; name: string; platform: string; screen: string | null; props: AnalyticsProps | null; username: string | null }>(
      db,
      sql`select e.at, e.name, e.platform, e.screen, e.props, u.username from analytics_events e
      left join users u on u.id = e.user_id order by e.at desc limit 40`,
    ),
    rows<{ spot: string; impressions: unknown; clicks: unknown }>(
      db,
      sql`select spot, sum(impressions) as impressions, sum(clicks) as clicks from ad_placements group by 1 order by 2 desc`,
    ),
  ]);

  const map = (list: { day: string; n: unknown }[]) => new Map(list.map((r) => [r.day, int(r.n)]));
  const [s, g, pl, pz, rv] = [map(dSignups), map(dGames), map(dPlayers), map(dPuzzles), map(dReviews)];
  const ap = new Map(dApp.map((r) => [r.day, r]));
  const daily: AnalyticsDay[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10);
    return {
      day: d,
      signups: s.get(d) ?? 0,
      games: g.get(d) ?? 0,
      players: pl.get(d) ?? 0,
      puzzles: pz.get(d) ?? 0,
      reviews: rv.get(d) ?? 0,
      devices: int(ap.get(d)?.devices),
      sessions: int(ap.get(d)?.sessions),
    };
  });
  const t = totals[0] ?? {};
  const a = active[0];
  const r = retention[0];
  const f = funnel[0];
  return {
    active: { day: int(a?.day), week: int(a?.week), month: int(a?.month), total: int(a?.total) },
    totals: {
      signups: int(t.signups),
      games: int(t.games),
      ratedGames: int(t.rated_games),
      puzzles: int(t.puzzles),
      puzzlesSolved: int(t.puzzles_solved),
      reviews: int(t.reviews),
      tournamentJoins: int(t.tournament_joins),
      messages: int(t.messages),
    },
    retention: { cohort: int(r?.cohort), day1: int(r?.day1), day7: int(r?.day7) },
    signupMethods: counts(methods),
    timeCategories: counts(categories),
    openings: counts(openings),
    countries: counts(countries),
    daily,
    app: {
      devices: int(app[0]?.devices),
      sessions: int(app[0]?.sessions),
      events: int(app[0]?.events),
      medianSessionSeconds: Math.round(int(sessions[0]?.median)),
      platforms: counts(platforms),
      screens: counts(screens),
      topEvents: counts(topEvents),
      versions: counts(versions),
      languages: counts(languages),
      funnel: { opened: int(f?.opened), signedUp: int(f?.signed_up), startedGame: int(f?.started), finishedGame: int(f?.finished) },
      recent: recent.map((e) => ({
        at: new Date(e.at).getTime(),
        name: e.name as AnalyticsEventName,
        platform: e.platform as AnalyticsPlatform,
        screen: e.screen,
        props: e.props,
        username: e.username,
      })),
    },
    sponsors: sponsors.map((x) => ({ spot: x.spot, impressions: int(x.impressions), clicks: int(x.clicks) })),
  };
}
