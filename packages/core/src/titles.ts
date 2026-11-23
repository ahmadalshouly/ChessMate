import type { FairPlayStatus } from './admin';

/**
 * Verified chess titles. A player applies with proof (a FIDE profile id and
 * a certificate or federation letter); staff review the application and
 * grant the title, and can take it away again, for example after a fair-play
 * closure. The title then shows next to the player's name.
 */

/** FIDE titles, strongest first within each list. */
export const CHESS_TITLES = ['GM', 'IM', 'FM', 'CM', 'WGM', 'WIM', 'WFM', 'WCM'] as const;
export type ChessTitle = (typeof CHESS_TITLES)[number];

export function isChessTitle(v: unknown): v is ChessTitle {
  return typeof v === 'string' && (CHESS_TITLES as readonly string[]).includes(v);
}

/** File types accepted as proof. */
export const TITLE_DOC_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const;
export type TitleDocType = (typeof TITLE_DOC_TYPES)[number];
/** Per file, before base64. */
export const MAX_TITLE_DOC_BYTES = 3 * 1024 * 1024;
export const MAX_TITLE_DOCS = 3;

export const TITLE_REVOKE_REASONS = ['fair_play', 'invalid_proof', 'federation_revoked', 'requested', 'other'] as const;
export type TitleRevokeReason = (typeof TITLE_REVOKE_REASONS)[number];

export type TitleApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface TitleDocument {
  id: string;
  name: string;
  mime: TitleDocType;
  size: number;
}

export interface TitleApplication {
  id: string;
  userId: string;
  username: string;
  title: ChessTitle;
  fullName: string;
  /** FIDE profile id; optional for national titles that FIDE does not list. */
  fideId: string | null;
  /** ISO 3166-1 alpha-2 of the federation that awarded the title. */
  federation: string | null;
  note: string | null;
  status: TitleApplicationStatus;
  documents: TitleDocument[];
  createdAt: number;
  reviewedAt: number | null;
  /** Reviewer's username. Players see only that staff reviewed it. */
  reviewedBy: string | null;
  /** Shown to the player when rejected. */
  reviewNote: string | null;
}

/** GET /api/titles/me */
export interface MyTitleState {
  title: ChessTitle | null;
  grantedAt: number | null;
  /** Newest first. */
  applications: TitleApplication[];
}

/** One file in an application, as the app uploads it. */
export interface TitleUpload {
  name: string;
  mime: string;
  /** Base64 file content, without a data: prefix. */
  data: string;
}

export interface TitleApplicationInput {
  title: ChessTitle;
  fullName: string;
  fideId: string | null;
  federation: string | null;
  note: string | null;
  documents: TitleUpload[];
}

export type TitleInputError = { error: string; field: string };

/** Size in bytes of a base64 string, without decoding it. */
export function base64Size(b64: string): number {
  const s = b64.replace(/\s/g, '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - pad;
}

/** Shared by the app (before upload) and the server. */
export function validateTitleApplication(raw: unknown): { value: TitleApplicationInput } | TitleInputError {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (!isChessTitle(b.title)) return { error: 'Choose a title', field: 'title' };
  const fullName = typeof b.fullName === 'string' ? b.fullName.trim() : '';
  if (fullName.length < 3 || fullName.length > 80) return { error: 'Enter your full name as FIDE lists it', field: 'fullName' };
  const fideId = typeof b.fideId === 'string' && b.fideId.trim() ? b.fideId.trim() : null;
  if (fideId !== null && !/^\d{4,10}$/.test(fideId)) return { error: 'A FIDE id is 4 to 10 digits', field: 'fideId' };
  const federation = typeof b.federation === 'string' && b.federation.trim() ? b.federation.trim().toUpperCase() : null;
  if (federation !== null && !/^[A-Z]{2}$/.test(federation)) return { error: 'Unknown federation', field: 'federation' };
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 1000) : null;
  const docs = Array.isArray(b.documents) ? b.documents : [];
  if (docs.length === 0) return { error: 'Attach at least one certificate or document', field: 'documents' };
  if (docs.length > MAX_TITLE_DOCS) return { error: `Attach at most ${MAX_TITLE_DOCS} files`, field: 'documents' };
  const documents: TitleUpload[] = [];
  for (const d of docs) {
    const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 120) : '';
    const mime = typeof o.mime === 'string' ? o.mime.toLowerCase() : '';
    const data = typeof o.data === 'string' ? o.data.replace(/^data:[^,]*,/, '') : '';
    if (!name || !data) return { error: 'A file could not be read', field: 'documents' };
    if (!(TITLE_DOC_TYPES as readonly string[]).includes(mime)) return { error: 'Use PDF, PNG, JPEG or WebP files', field: 'documents' };
    if (!/^[A-Za-z0-9+/=\s]+$/.test(data)) return { error: 'A file could not be read', field: 'documents' };
    if (base64Size(data) > MAX_TITLE_DOC_BYTES) return { error: 'Each file must be 3 MB or smaller', field: 'documents' };
    documents.push({ name, mime, data });
  }
  return { value: { title: b.title, fullName, fideId, federation, note, documents } };
}

/** Admin view of an application: the player's standing comes with it. */
export interface AdminTitleApplication extends TitleApplication {
  /** The title the player holds now, if any. */
  currentTitle: ChessTitle | null;
  playerClosed: boolean;
  fairPlay: FairPlayStatus;
  /** Other applications by the same player, newest first. */
  history: TitleApplication[];
}

/** POST /api/admin/titles/documents/:id/link → a short-lived URL that opens the file without a token. */
export interface TitleDocumentLink {
  url: string;
  expiresAt: number;
}
