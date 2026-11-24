import type { LessonCatalog } from '@chessmate/core';

import type { HttpRoute } from '../auth/http';

/**
 * GET /api/lessons: the published lessons for the Learn tab. Open to
 * everyone. The ETag is the catalog version, so an app that already has the
 * latest lessons gets a 304 and no body.
 */
export function lessonRoutes(catalog: () => LessonCatalog): HttpRoute {
  return (req, res, url) => {
    if (url.pathname !== '/api/lessons') return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
    res.setHeader('access-control-allow-headers', 'if-none-match');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    if (req.method !== 'GET') {
      res.writeHead(405, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Method not allowed' }));
      return true;
    }
    const c = catalog();
    const etag = `"${c.version}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { etag }).end();
      return true;
    }
    res.writeHead(200, { 'content-type': 'application/json', etag, 'cache-control': 'no-cache', 'access-control-expose-headers': 'etag' });
    res.end(JSON.stringify(c));
    return true;
  };
}
