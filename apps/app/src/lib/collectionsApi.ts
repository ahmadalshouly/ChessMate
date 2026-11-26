import { pathWithQuery, type AppPath, type CollectionItem, type CollectionSummary, type GameCollection } from '@chessmate/core';

import { apiRequest } from './social/api';

const cid = (id: string) => encodeURIComponent(id);

/** A game as the Share button describes it, ready to keep in a collection. */
export interface CollectableGame {
  title: string;
  link: AppPath;
  pgn: string | null;
}

export const collectionsApi = {
  /** Your collections; with a link, each says whether it already holds that game. */
  mine: (link?: AppPath) =>
    apiRequest<{ collections: CollectionSummary[] }>('GET', `/api/collections${link ? `?link=${encodeURIComponent(pathWithQuery(link))}` : ''}`).then((r) => r.collections),
  /** A player's collections shown on their profile (all of them when it is you). */
  of: (user: string) => apiRequest<{ collections: CollectionSummary[] }>('GET', `/api/collections?user=${encodeURIComponent(user)}`, undefined, { optionalAuth: true }).then((r) => r.collections),
  get: (id: string) => apiRequest<{ collection: GameCollection }>('GET', `/api/collections/${cid(id)}`, undefined, { optionalAuth: true }).then((r) => r.collection),
  create: (input: { name: string; description?: string | null; isPublic: boolean; item?: CollectableGame }) =>
    apiRequest<{ collection: GameCollection }>('POST', '/api/collections', input).then((r) => r.collection),
  update: (id: string, patch: { name?: string; description?: string | null; isPublic?: boolean }) =>
    apiRequest<{ collection: GameCollection }>('PATCH', `/api/collections/${cid(id)}`, patch).then((r) => r.collection),
  remove: (id: string) => apiRequest<{ ok: true }>('DELETE', `/api/collections/${cid(id)}`),
  add: (id: string, game: CollectableGame) => apiRequest<{ item: CollectionItem; added: boolean }>('POST', `/api/collections/${cid(id)}/items`, game),
  /** Takes a game out by its link (from the Share sheet). */
  removeLink: (id: string, link: AppPath) => apiRequest<{ ok: true }>('DELETE', `/api/collections/${cid(id)}/items`, { link }),
  removeItem: (id: string, itemId: string) => apiRequest<{ ok: true }>('DELETE', `/api/collections/${cid(id)}/items/${cid(itemId)}`),
};
