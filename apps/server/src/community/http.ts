import type { IncomingMessage } from 'node:http';

import type { HttpRoute, ResolveUser } from '../social/http';
import { CommunityError, type CommunityService } from './service';

async function readJson(req: IncomingMessage, max = 64 * 1024): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new CommunityError(400, 'Post too long');
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    throw new CommunityError(400, 'Invalid JSON');
  }
}

const ID = '([A-Za-z0-9_-]{1,64})';
const route = (method: string, pattern: string) => ({ method, re: new RegExp(`^${pattern}$`) });

/**
 * News and forum. Reading needs no sign-in; posting needs an account.
 *
 *   GET    /api/news?before=ms                 { posts }
 *   POST   /api/news                           staff: { title, body, pinned? } → { post }
 *   GET    /api/news/:id                       { post, comments }
 *   POST   /api/news/:id                       staff: edit { title?, body?, pinned? }
 *   DELETE /api/news/:id                       staff
 *   POST   /api/news/:id/like                  { like: boolean } → { liked, likeCount }
 *   POST   /api/news/:id/comments              { body } → { comment }
 *   DELETE /api/news/comments/:id              own or staff
 *   GET    /api/forum?category=&before=ms      { topics }
 *   POST   /api/forum                          { category, title, body } → { topic }
 *   GET    /api/forum/:id?offset=              { topic, replies }
 *   POST   /api/forum/:id/replies              { body } → { reply }
 *   POST   /api/forum/:id/moderate             staff: { pinned?, locked? } → { topic }
 *   DELETE /api/forum/:id                      own or staff
 *   DELETE /api/forum/replies/:id              own or staff
 */
export function communityRoutes(community: CommunityService, resolveUser: ResolveUser): HttpRoute {
  const R = {
    newsList: route('GET', '/api/news'),
    newsWrite: route('POST', '/api/news'),
    commentDelete: route('DELETE', `/api/news/comments/${ID}`),
    newsLike: route('POST', `/api/news/${ID}/like`),
    newsComment: route('POST', `/api/news/${ID}/comments`),
    newsGet: route('GET', `/api/news/${ID}`),
    newsEdit: route('POST', `/api/news/${ID}`),
    newsDelete: route('DELETE', `/api/news/${ID}`),
    topics: route('GET', '/api/forum'),
    topicStart: route('POST', '/api/forum'),
    replyDelete: route('DELETE', `/api/forum/replies/${ID}`),
    reply: route('POST', `/api/forum/${ID}/replies`),
    moderate: route('POST', `/api/forum/${ID}/moderate`),
    topic: route('GET', `/api/forum/${ID}`),
    topicDelete: route('DELETE', `/api/forum/${ID}`),
  };
  return async (req, res, url) => {
    const p = url.pathname;
    if (p !== '/api/news' && p !== '/api/forum' && !p.startsWith('/api/news/') && !p.startsWith('/api/forum/')) return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
      return true as const;
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    const match = (r: { method: string; re: RegExp }) => (req.method === r.method ? r.re.exec(p) : null);
    try {
      const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
      const viewer = token ? await resolveUser(token) : null;
      const num = (k: string) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) || undefined : undefined);
      let m: RegExpExecArray | null;
      if (match(R.newsList)) return json(200, { posts: await community.news(viewer, num('before')) });
      if (match(R.newsWrite)) return json(200, { post: await community.writeNews(viewer, await readJson(req)) });
      if ((m = match(R.commentDelete))) return json(200, await community.removeComment(viewer, m[1]!));
      if ((m = match(R.newsLike))) return json(200, await community.like(viewer, m[1]!, (await readJson(req)).like !== false));
      if ((m = match(R.newsComment))) return json(200, { comment: await community.comment(viewer, m[1]!, await readJson(req)) });
      if ((m = match(R.newsGet))) return json(200, await community.newsPost(viewer, m[1]!));
      if ((m = match(R.newsEdit))) return json(200, { post: await community.editNews(viewer, m[1]!, await readJson(req)) });
      if ((m = match(R.newsDelete))) return json(200, await community.removeNews(viewer, m[1]!));
      if (match(R.topics)) return json(200, { topics: await community.topics(viewer, { category: url.searchParams.get('category') ?? undefined, before: num('before') }) });
      if (match(R.topicStart)) return json(200, { topic: await community.startTopic(viewer, await readJson(req)) });
      if ((m = match(R.replyDelete))) return json(200, await community.removeReply(viewer, m[1]!));
      if ((m = match(R.reply))) return json(200, { reply: await community.reply(viewer, m[1]!, await readJson(req)) });
      if ((m = match(R.moderate))) return json(200, { topic: await community.moderate(viewer, m[1]!, await readJson(req)) });
      if ((m = match(R.topic))) return json(200, await community.topic(viewer, m[1]!, num('offset') ?? 0));
      if ((m = match(R.topicDelete))) return json(200, await community.removeTopic(viewer, m[1]!));
      return json(404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof CommunityError) return json(e.status, { error: e.message });
      console.error('community request failed', e);
      return json(500, { error: 'Something went wrong. Try again.' });
    }
  };
}
