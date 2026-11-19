import type { CommentView, ForumCategory, NewsPostView, ReplyView, TopicView } from '@chessmate/core';

import { apiRequest } from './social/api';

/** Reads work signed out; anything that writes needs the account (apiRequest asks for it). */
const read = <T>(path: string) => apiRequest<T>('GET', path, undefined, { optionalAuth: true });

export const newsApi = {
  list: (before?: number) => read<{ posts: NewsPostView[] }>(`/api/news${before ? `?before=${before}` : ''}`),
  get: (id: string) => read<{ post: NewsPostView; comments: CommentView[] }>(`/api/news/${encodeURIComponent(id)}`),
  like: (id: string, like: boolean) => apiRequest<{ liked: boolean; likeCount: number }>('POST', `/api/news/${encodeURIComponent(id)}/like`, { like }),
  comment: (id: string, body: string) => apiRequest<{ comment: CommentView }>('POST', `/api/news/${encodeURIComponent(id)}/comments`, { body }),
  deleteComment: (id: string) => apiRequest<{ ok: true }>('DELETE', `/api/news/comments/${encodeURIComponent(id)}`),
  write: (input: { title: string; body: string; pinned?: boolean }) => apiRequest<{ post: NewsPostView }>('POST', '/api/news', input),
  edit: (id: string, input: { title?: string; body?: string; pinned?: boolean }) => apiRequest<{ post: NewsPostView }>('POST', `/api/news/${encodeURIComponent(id)}`, input),
  remove: (id: string) => apiRequest<{ ok: true }>('DELETE', `/api/news/${encodeURIComponent(id)}`),
};

export const forumApi = {
  list: (category?: ForumCategory, before?: number) => {
    const q = new URLSearchParams();
    if (category) q.set('category', category);
    if (before) q.set('before', String(before));
    const s = q.toString();
    return read<{ topics: TopicView[] }>(`/api/forum${s ? `?${s}` : ''}`);
  },
  get: (id: string) => read<{ topic: TopicView; replies: ReplyView[] }>(`/api/forum/${encodeURIComponent(id)}`),
  start: (input: { category: ForumCategory; title: string; body: string }) => apiRequest<{ topic: TopicView }>('POST', '/api/forum', input),
  reply: (id: string, body: string) => apiRequest<{ reply: ReplyView }>('POST', `/api/forum/${encodeURIComponent(id)}/replies`, { body }),
  moderate: (id: string, input: { pinned?: boolean; locked?: boolean }) => apiRequest<{ topic: TopicView }>('POST', `/api/forum/${encodeURIComponent(id)}/moderate`, input),
  removeTopic: (id: string) => apiRequest<{ ok: true }>('DELETE', `/api/forum/${encodeURIComponent(id)}`),
  removeReply: (id: string) => apiRequest<{ ok: true }>('DELETE', `/api/forum/replies/${encodeURIComponent(id)}`),
};

export const donateApi = {
  info: () => read<{ enabled: boolean; min: number; max: number; currencies: string[] }>('/api/donate'),
  checkout: (amountCents: number, currency: string, returnUrl: string) =>
    apiRequest<{ url: string }>('POST', '/api/donate', { amountCents, currency, returnUrl }, { optionalAuth: true }),
};
