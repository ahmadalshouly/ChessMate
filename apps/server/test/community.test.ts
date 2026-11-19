import { createUser, openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CommunityError, CommunityService } from '../src/community/service';

let h: DbHandle;
let svc: CommunityService;
const ids: Record<string, string> = {};
let clock = 1_800_000_000_000;

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  for (const u of ['staffer', 'ana', 'ben', 'muted']) ids[u] = (await createUser(h.db, { username: u })).id;
  svc = new CommunityService({
    db: h.db,
    isStaff: (id) => id === ids.staffer,
    blockedReason: (id) => (id === ids.muted ? 'You are muted for now, so you cannot post' : null),
    now: () => (clock += 10_000),
  });
}, 60_000);

afterAll(async () => {
  await h.close();
});

const fails = async (p: Promise<unknown>, status: number) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(CommunityError);
  expect((e as CommunityError).status).toBe(status);
};

describe('news', () => {
  it('only staff write news; everyone reads, likes and comments', async () => {
    await fails(svc.writeNews(ids.ana!, { title: 'Hello', body: 'x' }), 403);
    const post = await svc.writeNews(ids.staffer!, { title: 'Launch day', body: 'Welcome to ChessMate!', pinned: true });
    expect(post).toMatchObject({ title: 'Launch day', pinned: true, likeCount: 0, author: { username: 'staffer', staff: true } });

    expect(await svc.like(ids.ana!, post.id, true)).toEqual({ liked: true, likeCount: 1 });
    expect(await svc.like(ids.ana!, post.id, true)).toEqual({ liked: true, likeCount: 1 });
    expect(await svc.like(ids.ben!, post.id, true)).toEqual({ liked: true, likeCount: 2 });
    expect(await svc.like(ids.ana!, post.id, false)).toEqual({ liked: false, likeCount: 1 });

    const c = await svc.comment(ids.ana!, post.id, { body: 'Great news' });
    await fails(svc.comment(ids.muted!, post.id, { body: 'hi' }), 403);
    await fails(svc.removeComment(ids.ben!, c.id), 403);
    const seen = await svc.newsPost(ids.ben!, post.id);
    expect(seen.post).toMatchObject({ liked: true, commentCount: 1 });
    expect(seen.comments.map((x) => [x.body, x.canDelete])).toEqual([['Great news', false]]);
    await svc.removeComment(ids.staffer!, c.id);
    expect((await svc.newsPost(null, post.id)).post.commentCount).toBe(0);
    expect((await svc.news(null)).map((p) => p.title)).toEqual(['Launch day']);
  });
});

describe('forum', () => {
  it('players start topics and reply; staff lock and pin; owners and staff delete', async () => {
    const t = await svc.startTopic(ids.ana!, { category: 'openings', title: 'Best reply to 1.e4?', body: 'Sicilian or e5?' });
    expect(t).toMatchObject({ category: 'openings', replyCount: 0, author: { username: 'ana', staff: false } });
    const r = await svc.reply(ids.ben!, t.id, { body: 'Caro-Kann!' });
    await fails(svc.moderate(ids.ana!, t.id, { locked: true }), 403);
    expect(await svc.moderate(ids.staffer!, t.id, { locked: true, pinned: true })).toMatchObject({ locked: true, pinned: true });
    await fails(svc.reply(ids.ben!, t.id, { body: 'one more' }), 403);
    const page = await svc.topic(ids.ana!, t.id);
    expect(page.topic.replyCount).toBe(1);
    expect(page.replies.map((x) => [x.body, x.canDelete])).toEqual([['Caro-Kann!', false]]);
    await fails(svc.removeReply(ids.ana!, r.id), 403);
    await svc.removeReply(ids.ben!, r.id);
    expect((await svc.topic(null, t.id)).topic.replyCount).toBe(0);
    expect((await svc.topics(null, { category: 'openings' })).map((x) => x.title)).toEqual(['Best reply to 1.e4?']);
    await fails(svc.removeTopic(ids.ben!, t.id), 403);
    await svc.removeTopic(ids.ana!, t.id);
    await fails(svc.topic(null, t.id), 404);
  });

  it('limits new topics per hour and rejects empty posts', async () => {
    await fails(svc.startTopic(ids.ben!, { title: 'ok title', body: '   ' }), 400);
    for (let i = 0; i < 5; i++) await svc.startTopic(ids.ben!, { title: `Topic ${i}`, body: 'body' });
    await fails(svc.startTopic(ids.ben!, { title: 'One too many', body: 'body' }), 429);
  });
});
