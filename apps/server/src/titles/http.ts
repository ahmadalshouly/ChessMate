import { MAX_TITLE_DOC_BYTES, MAX_TITLE_DOCS } from '@chessmate/core';
import type { HttpRoute } from '../auth/http';
import { applyCors, bearerUser, readJson, sendJson } from '../auth/http';
import { AuthError, type AuthService } from '../auth/service';
import { TitleError, type TitleService } from './service';

const STATUS: Record<TitleError['code'], number> = { invalid_input: 400, not_found: 404, conflict: 409, rate_limited: 429 };
/** Every file at the limit, base64-encoded (4/3), plus the form fields. */
const MAX_APPLY_BODY = Math.ceil((MAX_TITLE_DOC_BYTES * MAX_TITLE_DOCS * 4) / 3) + 64 * 1024;

/**
 * Title applications, for signed-in players:
 *
 *   GET  /api/titles/me                             your title and applications
 *   POST /api/titles/apply                          { title, fullName, fideId?, federation?, note?, documents: [{ name, mime, data(base64) }] }
 *   POST /api/titles/applications/:id/withdraw
 *   GET  /api/titles/documents/:id?exp=&sig=        one proof file, through a signed link from the admin console
 */
export function titleRoutes(titles: TitleService, auth: AuthService, opts: { corsOrigins?: string[] } = {}): HttpRoute {
  const corsOrigins = opts.corsOrigins ?? (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()) : undefined);
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/titles/')) return false;
    if (applyCors(req, res, corsOrigins)) return true;
    const parts = url.pathname.split('/').filter(Boolean).slice(2).map(decodeURIComponent);
    try {
      if (req.method === 'GET' && parts[0] === 'documents' && parts[1] && parts.length === 2) {
        const doc = await titles.signedDocument(parts[1], Number(url.searchParams.get('exp')), url.searchParams.get('sig') ?? '');
        if (!doc) {
          sendJson(res, 403, { error: { code: 'forbidden', message: 'This link has expired. Open the document again from the admin console' } });
          return true;
        }
        res.writeHead(200, {
          'content-type': doc.mime,
          'content-length': doc.data.length,
          'content-disposition': `inline; filename="${doc.name.replace(/[^\w.\- ]/g, '_')}"`,
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        });
        res.end(doc.data);
        return true;
      }
      const me = bearerUser(req, auth);
      if (!me) {
        sendJson(res, 401, { error: { code: 'unauthorized', message: 'Sign in to continue' } });
        return true;
      }
      const route = `${req.method} ${parts[0] ?? ''}${parts[2] ? `/:id/${parts[2]}` : ''}`;
      switch (route) {
        case 'GET me':
          sendJson(res, 200, await titles.mine(me.userId));
          return true;
        case 'POST apply':
          sendJson(res, 201, { application: await titles.apply(me.userId, await readJson(req, MAX_APPLY_BODY)) });
          return true;
        case 'POST applications/:id/withdraw':
          await titles.withdraw(me.userId, parts[1]!);
          sendJson(res, 200, { ok: true });
          return true;
        default:
          sendJson(res, 404, { error: { code: 'not_found', message: 'No such endpoint' } });
          return true;
      }
    } catch (e) {
      if (e instanceof TitleError) sendJson(res, STATUS[e.code], { error: { code: e.code, message: e.message, ...(e.field ? { field: e.field } : {}) } });
      else if (e instanceof AuthError) sendJson(res, e.message.includes('too large') ? 413 : 400, { error: { code: e.code, message: e.message } });
      else {
        console.error('[titles]', e);
        sendJson(res, 500, { error: { code: 'server_error', message: 'Something went wrong' } });
      }
      return true;
    }
  };
}
