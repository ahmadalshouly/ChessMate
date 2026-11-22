import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Puzzles seen recently on this device (newest last), kept between visits so the
 * next puzzle is always a new one, for guests too. Signed-in players also have
 * their history on the server.
 */
const KEY = 'chessmate.seenPuzzles.v1';
const KEEP = 300;

let cache: string[] | null = null;
let loading: Promise<string[]> | null = null;

export function seenPuzzles(): Promise<string[]> {
  if (cache) return Promise.resolve(cache);
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      const list = raw ? (JSON.parse(raw) as unknown) : [];
      cache = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(-KEEP) : [];
      return cache;
    })
    .catch(() => (cache = []));
  return loading;
}

export function markPuzzleSeen(id: string): Promise<void> {
  return markPuzzlesSeen([id]);
}

/** Marks a batch (a streak or rush page) with one storage write instead of one per puzzle. */
export async function markPuzzlesSeen(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const fresh = new Set(ids);
  const list = (await seenPuzzles()).filter((x) => !fresh.has(x));
  list.push(...fresh);
  cache = list.slice(-KEEP);
  await AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {});
}
