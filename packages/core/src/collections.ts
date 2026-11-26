import { pathWithQuery, type AppPath } from './share';

/**
 * Game collections: named lists of games a player keeps ("My best wins",
 * "Endgames to study"). Any board's Share button can add its game. An item
 * is the same link the Share button sends plus, when the game allowed it,
 * a PGN snapshot, so every kind of game fits: online games the server keeps,
 * computer and practice games, analysis lines, broadcasts and famous games.
 * A collection is private until its owner shows it on their profile.
 */

export const COLLECTION_NAME_MAX = 60;
export const COLLECTION_DESCRIPTION_MAX = 280;
export const COLLECTION_ITEM_TITLE_MAX = 120;
/** A PGN with headers and a few hundred moves fits easily. */
export const COLLECTION_PGN_MAX = 20_000;
export const COLLECTIONS_PER_PLAYER = 50;
export const GAMES_PER_COLLECTION = 200;

/** One collection in a list (no games). */
export interface CollectionSummary {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  /** Shown on the owner's profile. */
  isPublic: boolean;
  games: number;
  createdAt: number;
  updatedAt: number;
  /** Only in the signed-in player's own list when asked about a link: whether this game is in it. */
  has?: boolean;
}

export interface CollectionItem {
  id: string;
  title: string;
  link: AppPath;
  pgn: string | null;
  addedAt: number;
}

export interface GameCollection extends CollectionSummary {
  /** Newest first. */
  items: CollectionItem[];
  /** Owner's username and name, for the page header. */
  owner: { username: string; displayName: string } | null;
  isMine: boolean;
}

export interface CollectionInput {
  name: string;
  description: string | null;
  isPublic: boolean;
}

export interface CollectionItemInput {
  title: string;
  link: AppPath;
  pgn: string | null;
}

export class CollectionInputError extends Error {}

/** The routes a collection may link to: what the Share button builds (core share.ts). */
const SEG = '[A-Za-z0-9_.:%-]{1,96}';
const LINK_PATHS = [`/game/${SEG}`, `/watch/${SEG}`, `/watch/game/${SEG}`, '/analysis', '/review', `/immortals/game/${SEG}`].map((p) => new RegExp(`^${p}$`));
const QUERY_KEYS = new Set(['moves', 'initialFen', 'ply', 'review', 'white', 'black', 'result', 'orientation']);
const QUERY_VALUE_MAX = 4_000;

// Control characters (other than ordinary spaces) are dropped from names and titles.
const CONTROL = /[\u0000-\u001f\u007f]/g;
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim() : '');

/** Checks and tidies a new or edited collection. `partial` allows leaving fields out (an edit). */
export function cleanCollectionInput(raw: Record<string, unknown>, partial: true): Partial<CollectionInput>;
export function cleanCollectionInput(raw: Record<string, unknown>, partial?: false): CollectionInput;
export function cleanCollectionInput(raw: Record<string, unknown>, partial = false): Partial<CollectionInput> {
  const out: Partial<CollectionInput> = {};
  if (!partial || raw.name !== undefined) {
    const name = clean(raw.name);
    if (!name) throw new CollectionInputError('Give the collection a name');
    if (name.length > COLLECTION_NAME_MAX) throw new CollectionInputError(`Collection names can be up to ${COLLECTION_NAME_MAX} characters`);
    out.name = name;
  }
  if (!partial || raw.description !== undefined) {
    const d = typeof raw.description === 'string' ? raw.description.replace(/\r\n?/g, '\n').trim() : '';
    if (d.length > COLLECTION_DESCRIPTION_MAX) throw new CollectionInputError(`Descriptions can be up to ${COLLECTION_DESCRIPTION_MAX} characters`);
    out.description = d || null;
  }
  if (!partial || raw.isPublic !== undefined) out.isPublic = raw.isPublic === true;
  return out;
}

/** Checks a game to add: a link the Share button could have built, a title, and an optional PGN. */
export function cleanCollectionItem(raw: Record<string, unknown>): CollectionItemInput {
  const title = clean(raw.title).slice(0, COLLECTION_ITEM_TITLE_MAX);
  if (!title) throw new CollectionInputError('The game needs a title');
  const link = raw.link as { path?: unknown; query?: unknown } | null | undefined;
  const path = typeof link?.path === 'string' ? link.path : '';
  if (!LINK_PATHS.some((r) => r.test(path))) throw new CollectionInputError('This game cannot be added to a collection');
  let query: Record<string, string> | undefined;
  if (link?.query !== undefined && link.query !== null) {
    if (typeof link.query !== 'object' || Array.isArray(link.query)) throw new CollectionInputError('This game cannot be added to a collection');
    query = {};
    for (const [k, v] of Object.entries(link.query as Record<string, unknown>)) {
      if (!QUERY_KEYS.has(k) || typeof v !== 'string' || v.length > QUERY_VALUE_MAX) throw new CollectionInputError('This game cannot be added to a collection');
      query[k] = v;
    }
    if (Object.keys(query).length === 0) query = undefined;
  }
  let pgn: string | null = null;
  if (typeof raw.pgn === 'string' && raw.pgn.trim()) {
    if (raw.pgn.length > COLLECTION_PGN_MAX) throw new CollectionInputError('This game is too long to keep in a collection');
    pgn = raw.pgn.trim();
  }
  return { title, link: query ? { path, query } : { path }, pgn };
}

/**
 * The key that makes a game appear once per collection: the link with its
 * query in a fixed order, so the same game shared twice is the same item.
 */
export function collectionLinkKey(link: AppPath): string {
  const query = link.query ? Object.fromEntries(Object.entries(link.query).sort(([a], [b]) => a.localeCompare(b))) : undefined;
  return pathWithQuery({ path: link.path, query });
}

/** Every saved PGN of a collection in one file, as chess apps import them. */
export function collectionPgn(items: readonly Pick<CollectionItem, 'pgn'>[]): string {
  return items
    .map((i) => i.pgn)
    .filter((p): p is string => !!p)
    .join('\n\n');
}
