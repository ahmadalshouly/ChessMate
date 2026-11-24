import { LESSONS, type Puzzle } from '@chessmate/core';
import { openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdminService } from '../src/admin';
import { AuthService, ConsoleMailer, DbAuthStore, authRoutes } from '../src/auth';
import { lessonRoutes } from '../src/lessons/http';
import { LessonService } from '../src/lessons/service';
import { ChessServer } from '../src/server';

const SECRET = 'test-secret-test-secret-test-secret!';
const PASSWORD = 'correct horse battery';

// A stand-in puzzle database with one valid Lichess-format puzzle.
const PUZZLE: Puzzle = {
  id: 'abc12',
  fen: 'r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24',
  moves: ['f2g3', 'e6e7', 'b2b1', 'b3c1', 'b1c1', 'h6c1'],
  rating: 1800,
  ratingDeviation: 75,
  popularity: 95,
  plays: 2700,
  themes: ['crushing', 'hangingPiece'],
  gameUrl: null,
  openingTags: [],
};
const puzzles = { get: (id: string) => (id === PUZZLE.id ? PUZZLE : undefined), pick: () => PUZZLE };

let h: DbHandle;
let auth: AuthService;
let admin: AdminService;
let lessons: LessonService;
let server: ChessServer;
let base: string;
const tokens: Record<string, string> = {};

async function call(as: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/admin${path}`, {
    method,
    headers: { authorization: `Bearer ${tokens[as]}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const draft = (over: Record<string, unknown> = {}) => ({
  id: 'zwischenzug',
  chapterId: 'tactics',
  title: 'Zwischenzug',
  summary: 'An in-between move before the expected recapture.',
  level: 'intermediate',
  icon: 'swap-horizontal-outline',
  practiceTheme: 'intermezzo',
  readMore: [{ title: 'Zwischenzug (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Zwischenzug' }],
  published: false,
  steps: [
    { kind: 'explain', title: 'Wait a move', body: 'Before taking back, look for a stronger move.', fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', arrows: [{ from: 'e1', to: 'e2', tone: 'move' }], highlights: ['e2'] },
    { kind: 'puzzle', prompt: 'Find the in-between move.', puzzleId: 'abc12' },
  ],
  ...over,
});

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  auth = new AuthService({ store: new DbAuthStore(h.db), mailer: new ConsoleMailer(), secret: SECRET });
  for (const u of ['owner', 'mod', 'alice']) tokens[u] = (await auth.signup({ username: u, email: `${u}@example.com`, password: PASSWORD })).tokens.accessToken;
  admin = new AdminService({ db: h.db, auth, log: () => {} });
  await admin.load(['owner']);
  lessons = new LessonService({ db: h.db, puzzles });
  await lessons.load();
  admin.lessons = lessons;
  server = new ChessServer({
    port: 0,
    auth,
    admin,
    http: [authRoutes(auth, { rateLimit: false }), lessonRoutes(() => lessons.catalog())],
    fairPlay: { analyzer: null, log: () => {} },
  });
  base = `http://localhost:${await server.listen()}`;
  // Make "mod" a moderator.
  const modId = auth.verifyAccessToken(tokens.mod!)!.userId;
  expect((await call('owner', 'POST', `/players/${modId}/role`, { role: 'moderator' })).status).toBe(200);
}, 60_000);

afterAll(async () => {
  await server.close();
  await h.close();
});

describe('lessons', () => {
  it('seeds the built-in lessons into an empty database', async () => {
    const res = await fetch(`${base}/api/lessons`);
    expect(res.status).toBe(200);
    const catalog = (await res.json()) as { version: string; chapters: { lessons: { id: string }[] }[] };
    expect(catalog.chapters.flatMap((c) => c.lessons.map((l) => l.id))).toEqual(LESSONS.map((l) => l.id));
    // Seeding runs once: loading again keeps what is there.
    await lessons.load();
    expect(lessons.all().flatMap((c) => c.lessons)).toHaveLength(LESSONS.length);
  });

  it('answers 304 when the app already has the latest lessons', async () => {
    const first = await fetch(`${base}/api/lessons`);
    const etag = first.headers.get('etag')!;
    const again = await fetch(`${base}/api/lessons`, { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
  });

  it('only staff with lessons.manage can edit', async () => {
    expect((await call('alice', 'GET', '/lessons')).status).toBe(403);
    expect((await call('mod', 'GET', '/lessons')).status).toBe(200);
  });

  it('creates a draft that the app does not see, then publishes it', async () => {
    const before = (await (await fetch(`${base}/api/lessons`)).json()) as { version: string };
    const created = await call('mod', 'POST', '/lessons', draft());
    expect(created.status).toBe(200);
    expect(created.body.lesson.steps[1].puzzle.id).toBe('abc12');
    expect(created.body.lesson.published).toBe(false);
    const hidden = (await (await fetch(`${base}/api/lessons`)).json()) as { version: string; chapters: { lessons: { id: string }[] }[] };
    expect(hidden.chapters.flatMap((c) => c.lessons).some((l) => l.id === 'zwischenzug')).toBe(false);
    expect(hidden.version).toBe(before.version);

    const published = await call('mod', 'POST', '/lessons/zwischenzug', draft({ published: true }));
    expect(published.status).toBe(200);
    const shown = (await (await fetch(`${base}/api/lessons`)).json()) as { version: string; chapters: { id: string; lessons: { id: string }[] }[] };
    const tactics = shown.chapters.find((c) => c.id === 'tactics')!;
    expect(tactics.lessons[tactics.lessons.length - 1]!.id).toBe('zwischenzug');
    expect(shown.version).not.toBe(before.version);
    expect((await call('mod', 'POST', '/lessons', draft())).status).toBe(409);
  });

  it('refuses broken lessons with a clear reason', async () => {
    const badFen = await call('mod', 'POST', '/lessons/zwischenzug', draft({ steps: [{ kind: 'explain', title: 'x', body: 'y', fen: 'not a fen' }] }));
    expect(badFen.status).toBe(400);
    expect(badFen.body.error.message).toMatch(/Step 1/);
    const badPuzzle = await call('mod', 'POST', '/lessons/zwischenzug', draft({ steps: [{ kind: 'puzzle', prompt: 'Go', puzzleId: 'nope' }] }));
    expect(badPuzzle.status).toBe(400);
    expect(badPuzzle.body.error.message).toMatch(/no puzzle/);
    const badSquare = await call('mod', 'POST', '/lessons/zwischenzug', draft({ steps: [{ kind: 'explain', title: 'x', body: 'y', fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', highlights: ['z9'] }] }));
    expect(badSquare.status).toBe(400);
    expect((await call('mod', 'POST', '/lessons', draft({ id: 'new-one', chapterId: 'nowhere' }))).status).toBe(400);
  });

  it('moves lessons and chapters, and deletes them', async () => {
    const moved = await call('mod', 'POST', '/lessons/zwischenzug/move', { delta: -1 });
    const tactics = (moved.body.chapters as { id: string; lessons: { id: string }[] }[]).find((c) => c.id === 'tactics')!;
    expect(tactics.lessons.slice(-2).map((l) => l.id)).toEqual(['zwischenzug', 'doubleCheck']);

    expect((await call('mod', 'POST', '/lesson-chapters', { id: 'strategy', title: 'Strategy', blurb: 'Plans.' })).status).toBe(200);
    const chapters = (await call('mod', 'POST', '/lesson-chapters/strategy/move', { delta: -1 })).body.chapters as { id: string }[];
    expect(chapters.map((c) => c.id).slice(-2)).toEqual(['strategy', 'openings']);
    // A chapter with lessons can't be deleted; an empty one can.
    expect((await call('mod', 'POST', '/lesson-chapters/tactics/delete')).status).toBe(409);
    expect((await call('mod', 'POST', '/lesson-chapters/strategy/delete')).status).toBe(200);

    expect((await call('mod', 'POST', '/lessons/zwischenzug/delete')).status).toBe(200);
    expect((await call('mod', 'POST', '/lessons/zwischenzug/delete')).status).toBe(404);
  });

  it('suggests puzzles for the editor', async () => {
    const r = await call('mod', 'GET', '/lesson-puzzles?theme=hangingPiece&rating=1200');
    expect(r.body.puzzles[0].id).toBe('abc12');
    expect((await call('mod', 'GET', '/lesson-puzzles?id=abc12')).body.puzzles).toHaveLength(1);
  });
});
