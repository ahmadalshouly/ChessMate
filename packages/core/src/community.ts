/**
 * News (posts by the ChessMate team that players like and comment on) and the
 * forum (topics players start and discuss, moderated by staff).
 */
import type { PostLink } from './media';

export interface CommunityAuthor {
  id: string;
  username: string;
  displayName: string;
  /** Staff posts and replies are marked. */
  staff: boolean;
}

export interface NewsPostView {
  id: string;
  title: string;
  body: string;
  /** Picture at the top of the post. */
  imagePath: string | null;
  links: PostLink[];
  author: CommunityAuthor;
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  /** Whether the viewer liked it (false when signed out). */
  liked: boolean;
  createdAt: number;
  updatedAt: number | null;
}

export interface CommentView {
  id: string;
  body: string;
  author: CommunityAuthor;
  createdAt: number;
  /** The viewer wrote it or is staff. */
  canDelete: boolean;
}

export const FORUM_CATEGORIES = ['general', 'openings', 'tactics', 'endgames', 'tournaments', 'app', 'off-topic'] as const;
export type ForumCategory = (typeof FORUM_CATEGORIES)[number];

export interface TopicView {
  id: string;
  category: ForumCategory;
  title: string;
  /** Full text on the topic page; the first lines in lists. */
  body: string;
  author: CommunityAuthor;
  pinned: boolean;
  locked: boolean;
  replyCount: number;
  lastActivityAt: number;
  createdAt: number;
  canDelete: boolean;
}

export interface ReplyView extends CommentView {}

export const COMMUNITY_LIMITS = {
  titleMin: 3,
  titleMax: 120,
  postBodyMax: 20_000,
  topicBodyMax: 5_000,
  commentMax: 1_000,
  /** New topics a player may start per hour. */
  topicsPerHour: 5,
  /** Seconds between two comments or replies from one player. */
  commentGapS: 5,
} as const;

export function isForumCategory(v: unknown): v is ForumCategory {
  return typeof v === 'string' && (FORUM_CATEGORIES as readonly string[]).includes(v);
}

/** Trims and checks a title; returns it or an error message. */
export function cleanTitle(v: unknown): { value: string } | { error: string } {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (s.length < COMMUNITY_LIMITS.titleMin) return { error: `Write a title of at least ${COMMUNITY_LIMITS.titleMin} characters` };
  if (s.length > COMMUNITY_LIMITS.titleMax) return { error: `Titles can be at most ${COMMUNITY_LIMITS.titleMax} characters` };
  return { value: s };
}

/** Trims and checks a body; returns it or an error message. */
export function cleanBody(v: unknown, max: number): { value: string } | { error: string } {
  const s = typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '';
  if (!s) return { error: 'Write something first' };
  if (s.length > max) return { error: `At most ${max} characters` };
  return { value: s };
}
