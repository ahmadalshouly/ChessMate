import type { ExplorerFilters, ExplorerSource } from '@chessmate/core';
import { useEffect, useState } from 'react';

import { ExplorerFetchError, fetchExplorer, type ExplorerAnswer, type ExplorerFailure } from './api';

export interface ExplorerState {
  answer: ExplorerAnswer | null;
  loading: boolean;
  error: ExplorerFailure | null;
}

/** Wait while stepping quickly through moves, so only the position you stop on is fetched. */
const DEBOUNCE_MS = 120;

/**
 * The explorer's view of a position in one collection. Keeps showing the
 * previous answer while the next one loads (no flashing empty table).
 * `retry` fetches the same position again after an error.
 */
export function useExplorer(source: ExplorerSource, fen: string, filters: ExplorerFilters): ExplorerState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const speeds = filters.speeds?.join(',') ?? '';
  const ratings = filters.ratings?.join(',') ?? '';
  const request = `${source}|${fen}|${speeds}|${ratings}|${attempt}`;
  // The last answer and which request it was for: a different request means loading.
  const [done, setDone] = useState<{ request: string; answer: ExplorerAnswer | null; error: ExplorerFailure | null }>({ request: '', answer: null, error: null });

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const f: ExplorerFilters = {
        speeds: speeds ? (speeds.split(',') as ExplorerFilters['speeds']) : [],
        ratings: ratings ? (ratings.split(',').map(Number) as ExplorerFilters['ratings']) : [],
      };
      fetchExplorer(source, fen, f, ctrl.signal).then(
        (answer) => {
          if (!ctrl.signal.aborted) setDone({ request, answer, error: null });
        },
        (e) => {
          if (ctrl.signal.aborted) return;
          setDone({ request, answer: null, error: e instanceof ExplorerFetchError ? e.reason : 'unavailable' });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [request, source, fen, speeds, ratings]);

  const loading = done.request !== request;
  return { answer: done.answer, loading, error: loading ? null : done.error, retry: () => setAttempt((n) => n + 1) };
}
