import type { MyTitleState, TitleApplication, TitleApplicationInput } from '@chessmate/core';
import { useMemo } from 'react';

import { useAuth } from '@/lib/auth';

/** Uploads can be several megabytes; give them longer than the usual request timeout. */
const UPLOAD_TIMEOUT_MS = 120_000;

/** Player side of verified titles (/api/titles). */
export function useTitlesApi() {
  const { apiFetch } = useAuth();
  return useMemo(
    () => ({
      mine: () => apiFetch<MyTitleState>('/api/titles/me'),
      apply: async (input: TitleApplicationInput) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
        try {
          const r = await apiFetch<{ application: TitleApplication }>('/api/titles/apply', { method: 'POST', body: JSON.stringify(input), signal: controller.signal });
          return r.application;
        } finally {
          clearTimeout(timer);
        }
      },
      withdraw: (id: string) => apiFetch(`/api/titles/applications/${encodeURIComponent(id)}/withdraw`, { method: 'POST', body: '{}' }),
    }),
    [apiFetch],
  );
}
