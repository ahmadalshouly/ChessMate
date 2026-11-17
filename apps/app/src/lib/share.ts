import { Platform, Share } from 'react-native';

export const canDownload = Platform.OS === 'web';

/** Opens the system share sheet with PGN text (iOS/Android, and web where supported). */
export async function sharePgn(pgn: string, title: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title, text: pgn });
        return true;
      } catch {
        return false;
      }
    }
    return copyText(pgn);
  }
  const res = await Share.share({ title, message: pgn });
  return res.action === Share.sharedAction;
}

/** Copies text to the clipboard on web. Returns false where unsupported. */
export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Saves a .pgn file in the browser. */
export function downloadPgn(pgn: string, filename: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pgn') ? filename : `${filename}.pgn`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lets the user pick a .pgn file in the browser and resolves with its text. */
export function pickPgnFile(): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pgn,application/x-chess-pgn,text/plain';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

/** File name like "alice-vs-bob-2026-11-16.pgn". */
export function pgnFileName(white: string, black: string, endedAt: number): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 30) || 'player';
  return `${safe(white)}-vs-${safe(black)}-${new Date(endedAt).toISOString().slice(0, 10)}.pgn`;
}
