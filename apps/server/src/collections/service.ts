import {
  COLLECTIONS_PER_PLAYER,
  GAMES_PER_COLLECTION,
  CollectionInputError,
  cleanCollectionInput,
  cleanCollectionItem,
  collectionLinkKey,
  type AppPath,
  type CollectionItem,
  type CollectionSummary,
  type GameCollection,
} from '@chessmate/core';
import {
  addCollectionItem,
  collectionsHoldingLink,
  countCollectionItems,
  countCollections,
  createCollection,
  deleteCollection,
  findUserByUsername,
  getCollection,
  getCollectionItems,
  getUser,
  listCollections,
  removeCollectionItem,
  updateCollection,
  type Database,
  type GameCollectionItemRow,
  type GameCollectionRow,
} from '@chessmate/db';
import { randomUUID } from 'node:crypto';

export class CollectionsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Row {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}
interface ItemRow {
  id: string;
  title: string;
  linkPath: string;
  linkQuery: Record<string, string> | null;
  linkKey: string;
  pgn: string | null;
  addedAt: Date;
}

const summary = (r: Row, games: number): CollectionSummary => ({
  id: r.id,
  ownerId: r.userId,
  name: r.name,
  description: r.description,
  isPublic: r.isPublic,
  games,
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
});
const toItem = (r: ItemRow): CollectionItem => ({
  id: r.id,
  title: r.title,
  link: r.linkQuery && Object.keys(r.linkQuery).length ? { path: r.linkPath, query: r.linkQuery } : { path: r.linkPath },
  pgn: r.pgn,
  addedAt: r.addedAt.getTime(),
});

const NOT_FOUND = 'Collection not found';

/**
 * Game collections. Owners see and change all of theirs; everyone else sees
 * only the ones shown on the profile. Without a database (dev), collections
 * live in memory.
 */
export class CollectionsService {
  readonly db: Database | null;
  private readonly now: () => number;
  private memory = new Map<string, Row & { items: ItemRow[] }>();

  constructor(opts: { db?: Database | null; now?: () => number } = {}) {
    this.db = opts.db ?? null;
    this.now = opts.now ?? Date.now;
  }

  /** The account id behind an id or username, or null. */
  async resolveOwner(user: string): Promise<string | null> {
    if (!this.db) return user;
    return (await getUser(this.db, user))?.id ?? (await findUserByUsername(this.db, user))?.id ?? null;
  }

  /** A player's collections: all of them for the owner, the shown ones for anyone else. `link` marks the ones holding that game. */
  async list(ownerId: string, viewer: string | null, link?: AppPath): Promise<CollectionSummary[]> {
    const own = viewer === ownerId;
    let out: CollectionSummary[];
    if (this.db) {
      out = (await listCollections(this.db, ownerId, { publicOnly: !own })).map((r) => summary(r, r.games));
    } else {
      out = [...this.memory.values()]
        .filter((c) => c.userId === ownerId && (own || c.isPublic))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((c) => summary(c, c.items.length));
    }
    if (own && link) {
      const key = collectionLinkKey(link);
      const holding = new Set(
        this.db ? await collectionsHoldingLink(this.db, ownerId, key) : [...this.memory.values()].filter((c) => c.userId === ownerId && c.items.some((i) => i.linkKey === key)).map((c) => c.id),
      );
      out = out.map((c) => ({ ...c, has: holding.has(c.id) }));
    }
    return out;
  }

  /** One collection with its games. Someone else's private collection is "not found". */
  async get(id: string, viewer: string | null): Promise<GameCollection> {
    const row = await this.row(id);
    const mine = row?.userId === viewer;
    if (!row || (!mine && !row.isPublic)) throw new CollectionsError(404, NOT_FOUND);
    const items = (await this.items(id)).map(toItem);
    let owner: GameCollection['owner'] = null;
    if (this.db) {
      const u = await getUser(this.db, row.userId);
      if (u) owner = { username: u.username, displayName: u.displayName ?? u.username };
    }
    return { ...summary(row, items.length), items, owner, isMine: mine };
  }

  async create(viewer: string, raw: Record<string, unknown>): Promise<GameCollection> {
    let input;
    let first;
    try {
      input = cleanCollectionInput(raw);
      first = raw.item && typeof raw.item === 'object' ? cleanCollectionItem(raw.item as Record<string, unknown>) : null;
    } catch (e) {
      throw this.inputError(e);
    }
    const count = this.db ? await countCollections(this.db, viewer) : [...this.memory.values()].filter((c) => c.userId === viewer).length;
    if (count >= COLLECTIONS_PER_PLAYER) throw new CollectionsError(409, `You can have up to ${COLLECTIONS_PER_PLAYER} collections`);
    let id: string;
    if (this.db) {
      id = (await createCollection(this.db, { userId: viewer, ...input })).id;
    } else {
      id = randomUUID();
      const at = new Date(this.now());
      this.memory.set(id, { id, userId: viewer, ...input, createdAt: at, updatedAt: at, items: [] });
    }
    if (first) await this.insert(id, first);
    return this.get(id, viewer);
  }

  async update(viewer: string, id: string, raw: Record<string, unknown>): Promise<GameCollection> {
    await this.owned(viewer, id);
    let patch;
    try {
      patch = cleanCollectionInput(raw, true);
    } catch (e) {
      throw this.inputError(e);
    }
    if (this.db) await updateCollection(this.db, id, patch);
    else Object.assign(this.memory.get(id)!, patch, { updatedAt: new Date(this.now()) });
    return this.get(id, viewer);
  }

  async remove(viewer: string, id: string): Promise<void> {
    await this.owned(viewer, id);
    if (this.db) await deleteCollection(this.db, id);
    else this.memory.delete(id);
  }

  /** Adds a game. Adding one that is already there changes nothing. */
  async addItem(viewer: string, id: string, raw: Record<string, unknown>): Promise<{ item: CollectionItem; added: boolean }> {
    await this.owned(viewer, id);
    let input;
    try {
      input = cleanCollectionItem(raw);
    } catch (e) {
      throw this.inputError(e);
    }
    return this.insert(id, input);
  }

  /** Removes a game by its item id, or by its link (the Share sheet knows only the link). */
  async removeItem(viewer: string, id: string, by: { id: string } | { link: AppPath }): Promise<void> {
    await this.owned(viewer, id);
    const match = 'id' in by ? { id: by.id } : { linkKey: collectionLinkKey(by.link) };
    let removed: boolean;
    if (this.db) removed = await removeCollectionItem(this.db, id, match);
    else {
      const c = this.memory.get(id)!;
      const before = c.items.length;
      c.items = c.items.filter((i) => ('id' in match ? i.id !== match.id : i.linkKey !== match.linkKey));
      removed = c.items.length < before;
      if (removed) c.updatedAt = new Date(this.now());
    }
    if (!removed) throw new CollectionsError(404, 'That game is not in this collection');
  }

  private async insert(id: string, input: ReturnType<typeof cleanCollectionItem>): Promise<{ item: CollectionItem; added: boolean }> {
    const linkKey = collectionLinkKey(input.link);
    const existing = (await this.items(id)).find((i) => i.linkKey === linkKey);
    if (existing) return { item: toItem(existing), added: false };
    const count = this.db ? await countCollectionItems(this.db, id) : this.memory.get(id)!.items.length;
    if (count >= GAMES_PER_COLLECTION) throw new CollectionsError(409, `A collection can hold up to ${GAMES_PER_COLLECTION} games`);
    const row = { title: input.title, linkPath: input.link.path, linkQuery: input.link.query ?? null, linkKey, pgn: input.pgn };
    if (this.db) {
      const r = await addCollectionItem(this.db, id, row);
      return { item: toItem(r.item as GameCollectionItemRow), added: r.added };
    }
    const c = this.memory.get(id)!;
    const at = new Date(this.now());
    const item: ItemRow = { id: randomUUID(), ...row, addedAt: at };
    c.items.unshift(item);
    c.updatedAt = at;
    return { item: toItem(item), added: true };
  }

  private async row(id: string): Promise<Row | undefined> {
    if (this.db) return (await getCollection(this.db, id)) as GameCollectionRow | undefined;
    return this.memory.get(id);
  }

  private async items(id: string): Promise<ItemRow[]> {
    if (this.db) return getCollectionItems(this.db, id);
    return this.memory.get(id)?.items ?? [];
  }

  private async owned(viewer: string, id: string): Promise<Row> {
    const row = await this.row(id);
    // Someone else's collection answers like a missing one, so ids can't be probed.
    if (!row || row.userId !== viewer) throw new CollectionsError(404, NOT_FOUND);
    return row;
  }

  private inputError(e: unknown) {
    return e instanceof CollectionInputError ? new CollectionsError(400, e.message) : e;
  }
}
