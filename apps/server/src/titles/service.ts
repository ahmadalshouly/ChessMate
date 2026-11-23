import {
  isChessTitle,
  isRoleTag,
  validateTitleApplication,
  type ChessTitle,
  type RoleTag,
  type MyTitleState,
  type TitleApplication,
  type TitleDocType,
  type TitleDocumentLink,
} from '@chessmate/core';
import {
  getTitleApplication,
  getTitleDocument,
  insertTitleApplication,
  listTitleApplications,
  listRoleTaggedUsers,
  listTitledUsers,
  reviewTitleApplication,
  setUserRoleTag,
  setUserTitle,
  type Database,
  type TitleApplicationWithDocs,
} from '@chessmate/db';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type TitleErrorCode = 'invalid_input' | 'not_found' | 'conflict' | 'rate_limited';

export class TitleError extends Error {
  constructor(
    readonly code: TitleErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

/** How long a document link from the admin console stays valid. */
const LINK_TTL_MS = 10 * 60_000;
/** Applications a player may send in 30 days, so the queue cannot be flooded. */
const MAX_APPLICATIONS_PER_30D = 5;

export interface TitleServiceOptions {
  db: Database;
  now?: () => number;
  /** Signs document links. Random per process by default, so links die with a restart. */
  linkSecret?: Buffer;
}

/**
 * Verified titles: the player side (apply, withdraw, see your status), the
 * title cache that profiles read, and the storage of proof documents.
 * Reviewing applications and taking titles away is staff work and lives in
 * AdminService, which calls the grant/revoke helpers here.
 */
export class TitleService {
  private readonly db: Database;
  private readonly now: () => number;
  private readonly secret: Buffer;
  private readonly titles = new Map<string, ChessTitle>();
  private readonly roleTags = new Map<string, RoleTag>();

  constructor(opts: TitleServiceOptions) {
    this.db = opts.db;
    this.now = opts.now ?? Date.now;
    this.secret = opts.linkSecret ?? randomBytes(32);
  }

  async load(): Promise<void> {
    for (const t of await listTitledUsers(this.db)) if (isChessTitle(t.title)) this.titles.set(t.id, t.title);
    for (const t of await listRoleTaggedUsers(this.db)) if (isRoleTag(t.roleTag)) this.roleTags.set(t.id, t.roleTag);
  }

  /** Official role tag (staff, streamer, coach, ...), cached with titles because profiles read both. */
  roleTagOf(userId: string): RoleTag | null {
    return this.roleTags.get(userId) ?? null;
  }

  titleOf(userId: string): ChessTitle | null {
    return this.titles.get(userId) ?? null;
  }

  async mine(userId: string): Promise<MyTitleState> {
    const apps = await listTitleApplications(this.db, { userId, limit: 20 });
    const title = this.titleOf(userId);
    const granted = title ? apps.find((a) => a.status === 'approved' && a.title === title) : undefined;
    return { title, grantedAt: granted?.reviewedAt?.getTime() ?? null, applications: apps.map((a) => toApplication(a, false)) };
  }

  async apply(userId: string, raw: unknown): Promise<TitleApplication> {
    const v = validateTitleApplication(raw);
    if ('error' in v) throw new TitleError('invalid_input', v.error, v.field);
    const input = v.value;
    const existing = await listTitleApplications(this.db, { userId, limit: 50 });
    if (existing.some((a) => a.status === 'pending')) throw new TitleError('conflict', 'You already have an application waiting for review');
    if (this.titleOf(userId) === input.title) throw new TitleError('conflict', 'Your account already shows this title', 'title');
    const recent = existing.filter((a) => a.createdAt.getTime() > this.now() - 30 * 86_400_000).length;
    if (recent >= MAX_APPLICATIONS_PER_30D) throw new TitleError('rate_limited', 'Too many applications this month. Try again later');
    const documents = input.documents.map((d) => ({ name: d.name, mime: d.mime, data: Buffer.from(d.data, 'base64') }));
    for (const d of documents) if (!looksLike(d.mime, d.data)) throw new TitleError('invalid_input', `${d.name} is not a valid ${d.mime === 'application/pdf' ? 'PDF' : 'image'}`, 'documents');
    const id = await insertTitleApplication(this.db, { userId, ...input, documents });
    return toApplication((await getTitleApplication(this.db, id))!, false);
  }

  async withdraw(userId: string, applicationId: string): Promise<void> {
    const a = await getTitleApplication(this.db, applicationId);
    if (!a || a.userId !== userId) throw new TitleError('not_found', 'No such application');
    if (!(await reviewTitleApplication(this.db, applicationId, { status: 'withdrawn', at: new Date(this.now()) }))) throw new TitleError('conflict', 'This application was already reviewed');
  }

  // ---------------------------------------------------------------- used by AdminService

  /** Sets or clears the title on the account and in the cache. */
  async setTitle(userId: string, title: ChessTitle | null): Promise<void> {
    await setUserTitle(this.db, userId, title, new Date(this.now()));
    if (title) this.titles.set(userId, title);
    else this.titles.delete(userId);
  }

  /** Sets or clears the role tag on the account and in the cache. Admin console only. */
  async setRoleTag(userId: string, tag: RoleTag | null): Promise<void> {
    await setUserRoleTag(this.db, userId, tag, new Date(this.now()));
    if (tag) this.roleTags.set(userId, tag);
    else this.roleTags.delete(userId);
  }

  /** A URL that opens one document for LINK_TTL_MS without a bearer token (images and PDFs open in a browser tab). */
  documentLink(docId: string, baseUrl: string): TitleDocumentLink {
    const expiresAt = this.now() + LINK_TTL_MS;
    return { url: `${baseUrl}/api/titles/documents/${encodeURIComponent(docId)}?exp=${expiresAt}&sig=${this.sign(docId, expiresAt)}`, expiresAt };
  }

  /** Checks a signed link and returns the file, or null when the link is wrong or expired. */
  async signedDocument(docId: string, exp: number, sig: string): Promise<{ name: string; mime: string; data: Buffer } | null> {
    if (!Number.isFinite(exp) || exp < this.now()) return null;
    const want = Buffer.from(this.sign(docId, exp));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    return getTitleDocument(this.db, docId);
  }

  private sign(docId: string, exp: number): string {
    return createHmac('sha256', this.secret).update(`${docId}.${exp}`).digest('base64url');
  }
}

/** Magic bytes, so a renamed executable cannot pass as a certificate. */
function looksLike(mime: string, b: Buffer): boolean {
  switch (mime as TitleDocType) {
    case 'application/pdf':
      return b.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'image/png':
      return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/webp':
      return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
    default:
      return false;
  }
}

export function toApplication(a: TitleApplicationWithDocs, staffView: boolean): TitleApplication {
  return {
    id: a.id,
    userId: a.userId,
    username: a.username,
    title: a.title as ChessTitle,
    fullName: a.fullName,
    fideId: a.fideId,
    federation: a.federation,
    note: a.note,
    status: a.status as TitleApplication['status'],
    documents: a.documents.map((d) => ({ id: d.id, name: d.name, mime: d.mime as TitleDocType, size: d.size })),
    createdAt: a.createdAt.getTime(),
    reviewedAt: a.reviewedAt?.getTime() ?? null,
    reviewedBy: staffView ? a.reviewedByName : null,
    reviewNote: a.reviewNote,
  };
}
