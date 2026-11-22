import type { StaffRole } from '@chessmate/core';
import { createUser, openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ChessServer } from '../src/server';
import { WatchError } from '../src/watch/errors';
import { Game } from '@chessmate/core';
import { BroadcastAnalyzer } from '../src/watch/analysis';
import { EventService, lastClocks } from '../src/watch/events';
import { StreamerService } from '../src/watch/streamers';
import { BroadcastSync, type Fetcher } from '../src/watch/sync';

let h: DbHandle;
let clock = Date.UTC(2026, 10, 21, 10, 0);
const now = () => clock;
const ids: Record<string, string> = {};
const roles: Record<string, StaffRole> = {};
const roleOf = (id: string): StaffRole => roles[id] ?? 'user';

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  for (const name of ['wadmin', 'wmod', 'streamy', 'organiser', 'outsider', 'cohost']) ids[name] = (await createUser(h.db, { username: name })).id;
  roles[ids.wadmin!] = 'admin';
  roles[ids.wmod!] = 'moderator';
}, 60_000);

afterAll(async () => {
  await h.close();
});

const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof WatchError ? e.status : -1;
  }
  return 0;
};

const ROUND_PGN = `[Event "City Open"]
[Round "1.1"]
[White "Alpha, Ann"]
[Black "Beta, Bob"]
[WhiteTitle "IM"]
[WhiteElo "2450"]
[BlackElo "2300"]
[WhiteFideId "111"]
[Result "1-0"]

1. e4 { [%clk 1:30:00] } e5 { [%clk 1:29:30] } 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0

[Event "City Open"]
[Round "1.2"]
[White "Gamma, Gil"]
[Black "Delta, Dee"]
[Result "*"]

1. d4 { [%clk 1:29:00] } d5 { [%clk 1:28:00] } *
`;

describe('streamers', () => {
  it('apply, review, go live, list and remove', async () => {
    const svc = new StreamerService({ db: h.db, now, roleOf });
    const tags: string[] = [];
    svc.attach({ notify: () => {}, setStreamerTag: async (u, on) => void tags.push(`${u}:${on}`) });
    const me = ids.streamy!;
    expect(await err(svc.apply(me, { channels: [{ platform: 'twitch', url: 'https://youtube.com/x' }], about: 'I stream blitz every evening, come along!' }))).toBe(400);
    const app = await svc.apply(me, { channels: [{ platform: 'twitch', url: 'twitch.tv/streamy' }], about: 'I stream blitz every evening, come along!' });
    expect(app.status).toBe('pending');
    expect(await err(svc.apply(me, { channels: [{ url: 'twitch.tv/streamy' }], about: 'Again again again again again' }))).toBe(409);
    expect((await svc.mine(me)).canApply).toBe(false);
    // Players cannot review; moderators can.
    expect(await err(svc.review(ids.outsider!, app.id, { approve: true }))).toBe(403);
    const done = await svc.review(ids.wmod!, app.id, { approve: true });
    expect(done.status).toBe('approved');
    expect(tags).toEqual([`${me}:true`]);
    // Going live: one of the channels by default.
    const live = await svc.goLive(me, { title: 'Titled Tuesday' });
    expect(live.live).toMatchObject({ title: 'Titled Tuesday', url: 'https://twitch.tv/streamy', platform: 'twitch' });
    expect((await svc.list())[0]).toMatchObject({ username: 'streamy', live: { title: 'Titled Tuesday' } });
    // Left on too long: switched off.
    clock += 13 * 3_600_000;
    await svc.sweep();
    expect((await svc.get(me))!.live).toBeNull();
    await svc.updateProfile(me, { headline: 'Daily blitz', channels: [{ url: 'https://kick.com/streamy' }] });
    expect((await svc.get(me))!.channels).toEqual([{ platform: 'kick', url: 'https://kick.com/streamy' }]);
    expect(await err(svc.goLive(ids.outsider!, { title: 'x' }))).toBe(403);
    await svc.remove(ids.wmod!, me);
    expect(await svc.get(me)).toBeNull();
    expect(tags.at(-1)).toBe(`${me}:false`);
  });
});

describe('events', () => {
  it('admins create; PGN fills games and players; standings follow results', async () => {
    const svc = new EventService({ db: h.db, now, roleOf });
    await svc.load();
    expect(await err(svc.create(ids.outsider!, { name: 'Nope', startsAt: clock, endsAt: clock + 86_400_000 }))).toBe(403);
    const e = await svc.create(ids.wadmin!, { name: 'City Open', startsAt: clock, endsAt: clock + 3 * 86_400_000, format: 'swiss', location: 'Berlin' });
    expect(e).toMatchObject({ published: false, canManage: true });
    // Unpublished: hidden from players.
    expect(await err(svc.detail(ids.outsider!, e.id))).toBe(404);
    const withRound = await svc.addRound(ids.wadmin!, e.id, { number: 1 });
    const roundId = withRound.rounds[0]!.id;
    const res = await svc.pastePgn(ids.wadmin!, roundId, { pgn: ROUND_PGN });
    expect(res).toMatchObject({ games: 2, changed: 2, allFinished: false });
    await svc.setFlags(ids.wadmin!, e.id, { published: true });
    const d = await svc.detail(ids.outsider!, e.id);
    expect(d.canManage).toBe(false);
    expect(d.rounds[0]!.source).toBeUndefined();
    expect(d.status).toBe('live');
    expect(d.players.map((p) => p.name).sort()).toEqual(['Alpha, Ann', 'Beta, Bob', 'Delta, Dee', 'Gamma, Gil']);
    expect(d.players.find((p) => p.name === 'Alpha, Ann')).toMatchObject({ title: 'IM', rating: 2450, fideId: '111' });
    const g1 = d.rounds[0]!.games.find((g) => g.board === 1)!;
    expect(g1).toMatchObject({ result: '1-0', status: 'finished', ply: 7, lastMove: 'h5f7' });
    const g2 = d.rounds[0]!.games.find((g) => g.board === 2)!;
    expect(g2).toMatchObject({ status: 'live', whiteClockMs: 5_340_000, blackClockMs: 5_280_000 });
    expect(d.standings[0]).toMatchObject({ name: 'Alpha, Ann', points: 1 });
    // Pasting the same file again changes nothing.
    expect((await svc.pastePgn(ids.wadmin!, roundId, { pgn: ROUND_PGN })).changed).toBe(0);
    // A result entered by hand.
    await svc.setResult(ids.wadmin!, g2.id, '1/2-1/2');
    const after = await svc.detail(null, e.id);
    expect(after.standings.find((s) => s.name === 'Gamma, Gil')!.points).toBe(0.5);
    const full = await svc.game(null, g1.id);
    expect(full.moves).toHaveLength(7);
    expect(full.clocks.slice(0, 2)).toEqual([5_400_000, 5_370_000]);
    // Hidden by staff: gone for players.
    await svc.setFlags(ids.wadmin!, e.id, { hidden: true });
    expect(await err(svc.detail(null, e.id))).toBe(404);
    expect(lastClocks([1, 2, null, 4, null])).toEqual({ w: 1, b: 4 });
  });

  it('an approved organiser manages only their own event', async () => {
    const svc = new EventService({ db: h.db, now, roleOf });
    await svc.load();
    const org = ids.organiser!;
    const app = await svc.apply(org, {
      eventName: 'Club Championship',
      organization: 'Kreuzberg Chess Club',
      location: 'Berlin',
      startsAt: clock + 86_400_000,
      endsAt: clock + 2 * 86_400_000,
      description: 'Our yearly club championship with 40 players and DGT boards.',
      coverage: 'DGT LiveChess PGN link',
    });
    expect(await err(svc.apply(org, { ...app, eventName: 'Second one' }))).toBe(409);
    expect(await err(svc.review(ids.wmod!, app.id, { approve: true }))).toBe(403);
    const reviewed = await svc.review(ids.wadmin!, app.id, { approve: true });
    const eventId = reviewed.eventId!;
    expect(eventId).toBeTruthy();
    const d = await svc.detail(org, eventId);
    expect(d).toMatchObject({ canManage: true, published: false, name: 'Club Championship' });
    await svc.addPlayer(org, eventId, { name: 'Ann Alpha', title: 'FM', rating: 2300, federation: 'DE' });
    await svc.addOrganizer(org, eventId, 'cohost');
    expect(svc.canManage(ids.cohost!, eventId)).toBe(true);
    const PNG = 'data:image/png;base64,iVBORw0KGgo=';
    await svc.addNews(org, eventId, { title: 'Round 1 pairings', body: 'Pairings are up.', image: PNG, links: [{ label: 'Pairings', url: 'example.org/pairings' }] });
    expect(await err(svc.addNews(org, eventId, { title: 'Bad link', body: 'x', links: [{ url: 'javascript:alert(1)' }] }))).toBe(400);
    const withCover = await svc.update(org, eventId, { ...d, cover: PNG, links: [{ label: 'Live commentary', url: 'https://twitch.tv/club' }] });
    expect(withCover.coverPath).toMatch(new RegExp(`^/api/watch/events/${eventId}/cover\\?v=`));
    expect(withCover.links).toEqual([{ label: 'Live commentary', url: 'https://twitch.tv/club' }]);
    expect((await svc.cover(eventId))!.mime).toBe('image/png');
    await svc.setFlags(org, eventId, { published: true });
    // Organisers cannot feature, hide or delete, nor touch other events.
    expect(await err(svc.setFlags(org, eventId, { featured: true }))).toBe(403);
    expect(await err(svc.remove(org, eventId))).toBe(403);
    expect(await err(svc.update(ids.outsider!, eventId, { name: 'Hacked', startsAt: clock, endsAt: clock + 1 }))).toBe(403);
    const list = await svc.list(org);
    expect(list.managed.map((m) => m.id)).toContain(eventId);
    expect(list.upcoming.map((m) => m.id)).toContain(eventId);
    expect((await svc.list(ids.outsider!)).managed).toEqual([]);
    const post = (await svc.detail(null, eventId)).news[0]!;
    expect(post).toMatchObject({ title: 'Round 1 pairings', author: { username: 'organiser' }, links: [{ label: 'Pairings', url: 'https://example.org/pairings' }] });
    expect(post.imagePath).toBe(`/api/watch/news/${post.id}/image`);
    expect((await svc.newsImage(post.id))!.data.length).toBeGreaterThan(0);
  });
});

describe('broadcast sync', () => {
  it('polls a live PGN link and imports Lichess broadcasts', async () => {
    const events = new EventService({ db: h.db, now, roleOf });
    await events.load();
    const files: Record<string, string> = {
      'https://boards.example/live.pgn': ROUND_PGN,
      'https://lichess.test/api/broadcast/top?page=1': JSON.stringify({
        active: [{ tour: { id: 'tour1', name: 'Grand Chess Tour', tier: 5, dates: [clock - 86_400_000, clock + 86_400_000], info: { format: 'Round robin', tc: '90+30' } } }, { tour: { id: 'small', name: 'Local', tier: 3 } }],
        upcoming: [],
      }),
      'https://lichess.test/api/broadcast/tour1': JSON.stringify({
        tour: { id: 'tour1', name: 'Grand Chess Tour', url: 'https://lichess.org/broadcast/gct/tour1' },
        rounds: [
          { id: 'roundAAA', name: 'Round 1', startsAt: clock - 86_400_000, finished: true },
          { id: 'roundBBB', name: 'Round 2', startsAt: clock - 3_600_000, ongoing: true },
        ],
      }),
      'https://lichess.test/api/broadcast/round/roundAAA.pgn': ROUND_PGN,
      'https://lichess.test/api/broadcast/round/roundBBB.pgn': ROUND_PGN.replace('1.1', '2.1').replace('1.2', '2.2'),
    };
    const asked: string[] = [];
    const fetcher: Fetcher = async (url) => {
      asked.push(url);
      const body = files[url];
      return { status: body ? 200 : 404, ok: !!body, text: async () => body ?? '' };
    };
    const sync = new BroadcastSync({ db: h.db, events, now, fetch: fetcher, lichessOrigin: 'https://lichess.test' });

    const e = await events.create(ids.wadmin!, { name: 'Live Open', startsAt: clock - 3_600_000, endsAt: clock + 86_400_000 });
    await events.addRound(ids.wadmin!, e.id, { number: 1, source: { kind: 'pgnUrl', url: 'https://boards.example/live.pgn' } });
    await sync.tick();
    const d = await events.detail(ids.wadmin!, e.id);
    expect(d.rounds[0]!.games).toHaveLength(2);
    expect(d.rounds[0]!.source).toMatchObject({ kind: 'pgnUrl', syncError: null });

    // Lichess import (first tick ran it already): only the top-tier tour.
    const list = await events.list(null);
    const imported = [...list.live, ...list.upcoming, ...list.recent].find((x) => x.name === 'Grand Chess Tour')!;
    expect(imported).toMatchObject({ source: 'lichess', sourceUrl: 'https://lichess.org/broadcast/gct/tour1', format: 'roundRobin', roundCount: 2 });
    expect([...list.live, ...list.upcoming, ...list.recent].some((x) => x.name === 'Local')).toBe(false);
    const gct = await events.detail(null, imported.id);
    // The finished round was synced once; the ongoing one on the normal tick.
    expect(gct.rounds.map((r) => r.games.length)).toEqual([2, 2]);
    expect(asked).toContain('https://lichess.test/api/broadcast/round/roundAAA.pgn');

    // Switched off: no more imports.
    await events.saveSettings(ids.wadmin!, { lichessImport: false });
    expect(await sync.importLichess()).toBe(0);
    expect(await err(events.saveSettings(ids.outsider!, { lichessImport: true }))).toBe(403);
  });
});

describe('live broadcast analysis', () => {
  it('analyses the newest position first, then fills in grades', async () => {
    const svc = new EventService({ db: h.db, now, roleOf });
    await svc.load();
    const changed: string[] = [];
    svc.attach({ notify: () => {}, gamesChanged: (ids) => changed.push(...ids) });
    const e = await svc.create(ids.wadmin!, { name: 'Analysed Open', startsAt: clock, endsAt: clock + 86_400_000 });
    const round = (await svc.addRound(ids.wadmin!, e.id, { number: 1 })).rounds[0]!;
    await svc.pastePgn(ids.wadmin!, round.id, { pgn: ROUND_PGN });
    expect(changed).toHaveLength(2);
    // A stand-in engine: the first legal move is "best"; mate scores in finished positions come from the analyzer.
    const asked: string[] = [];
    const engine = {
      evaluate: async (fen: string) => {
        asked.push(fen);
        const m = new Game(fen).legalMoves()[0];
        return { score: { cp: 20 }, bestMove: m ? `${m.from}${m.to}` : undefined, pv: m ? [`${m.from}${m.to}`] : [], depth: 12 };
      },
    };
    const updates: string[] = [];
    const analyzer = new BroadcastAnalyzer({ db: h.db, engine, onUpdate: (id) => {
        updates.push(id);
        svc.invalidate(id);
      },
    });
    const live = (await svc.detail(ids.wadmin!, e.id)).rounds[0]!.games.find((g) => g.board === 2)!;
    // First step: the newest position (after 1. d4 d5).
    await analyzer.step(live.id);
    const finalFen = (await svc.game(ids.wadmin!, live.id)).fen;
    expect(asked[0]).toBe(finalFen);
    // Keep going until every position is analysed.
    for (let i = 0; i < 5; i++) await analyzer.step(live.id);
    const g = await svc.game(ids.wadmin!, live.id);
    expect(g.analysis.scores.every((sc) => sc !== null)).toBe(true);
    expect(g.analysis.grades).toHaveLength(2);
    expect(g.analysis.grades.every((x) => typeof x === 'string')).toBe(true);
    expect(g.analysis.best[0]).toBeTruthy();
    expect(updates).toContain(e.id);
    const summary = (await svc.detail(ids.wadmin!, e.id)).rounds[0]!.games.find((x) => x.id === live.id)!;
    expect(summary.evalScore).toEqual({ cp: 20 });
    expect(summary.lastGrade).toBe(g.analysis.grades[1]);
  });
});

describe('watch API through the full server', () => {
  let server: ChessServer;
  let base: string;
  beforeAll(async () => {
    server = new ChessServer({ port: 0, streamers: new StreamerService({ db: h.db, roleOf }), events: new EventService({ db: h.db, roleOf }) });
    base = `http://localhost:${await server.listen()}`;
  });
  afterAll(() => server.close());

  it('serves lists to anyone and asks for sign-in to write', async () => {
    const ev = await fetch(`${base}/api/watch/events`);
    expect(ev.status).toBe(200);
    expect(await ev.json()).toHaveProperty('live');
    expect((await fetch(`${base}/api/watch/streamers`)).status).toBe(200);
    expect(((await (await fetch(`${base}/api/watch/me`)).json()) as { signedIn: boolean }).signedIn).toBe(false);
    expect((await fetch(`${base}/api/watch/streamers/apply`, { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await fetch(`${base}/api/watch/nothing-here`)).status).toBe(404);
  });
});
