import AsyncStorage from '@react-native-async-storage/async-storage';
import { withDerivedFields, type ArchivedGame } from '@chessmate/core';
import { useCallback, useEffect, useState } from 'react';

/**
 * On-device game archive. Finished online games, practice games and PGN
 * imports are kept here so history works offline and for guests. When the
 * accounts/database server lands, server games are merged in with
 * `fromServerRecord` from @chessmate/core and de-duplicated by id.
 */
const KEY = 'chessmate.archive.v1';
const MAX_GAMES = 2000;

let cache: ArchivedGame[] | null = null;
const listeners = new Set<() => void>();

async function read(): Promise<ArchivedGame[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? (parsed as ArchivedGame[]) : [];
  } catch {
    // Storage is unavailable during static web rendering or in private mode.
    cache = [];
  }
  return cache;
}

async function write(games: ArchivedGame[]) {
  cache = [...games].sort((a, b) => b.endedAt - a.endedAt).slice(0, MAX_GAMES);
  listeners.forEach((l) => l());
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Keep the in-memory copy; nothing else to do.
  }
}

export async function listGames(): Promise<ArchivedGame[]> {
  return read();
}

export async function getGame(id: string): Promise<ArchivedGame | undefined> {
  return (await read()).find((g) => g.id === id);
}

/** Adds or replaces games by id. Returns how many were new. */
export async function saveGames(games: ArchivedGame[]): Promise<number> {
  const current = await read();
  const byId = new Map(current.map((g) => [g.id, g]));
  let added = 0;
  for (const g of games) {
    if (!byId.has(g.id)) added++;
    byId.set(g.id, withDerivedFields(g));
  }
  await write([...byId.values()]);
  return added;
}

export async function saveGame(game: ArchivedGame): Promise<void> {
  await saveGames([game]);
}

export async function deleteGame(id: string): Promise<void> {
  await write((await read()).filter((g) => g.id !== id));
}

/** Live view of the archive; re-renders when games are added or removed. */
export function useArchive() {
  const [games, setGames] = useState<ArchivedGame[] | null>(cache);
  const refresh = useCallback(() => {
    read().then((g) => setGames([...g]));
  }, []);
  useEffect(() => {
    refresh();
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, [refresh]);
  return { games, loading: games === null };
}

export function useArchivedGame(id: string | undefined) {
  const { games, loading } = useArchive();
  return { game: games?.find((g) => g.id === id), loading };
}
