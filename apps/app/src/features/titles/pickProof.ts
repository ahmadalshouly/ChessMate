import { MAX_TITLE_DOC_BYTES, TITLE_DOC_TYPES, type TitleUpload } from '@chessmate/core';
import * as DocumentPicker from 'expo-document-picker';

export type PickedProof = TitleUpload & { size: number };
export type PickProblem = { kind: 'tooBig' | 'wrongType'; name: string };

const EXT: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

/**
 * Lets the player pick certificates (PDF or images) and reads them as base64.
 * Works on web, iOS and Android without a native rebuild beyond Expo Go.
 */
export async function pickProof(): Promise<{ files: PickedProof[]; problems: PickProblem[] }> {
  const res = await DocumentPicker.getDocumentAsync({ type: [...TITLE_DOC_TYPES], multiple: true, copyToCacheDirectory: true, base64: false });
  if (res.canceled) return { files: [], problems: [] };
  const files: PickedProof[] = [];
  const problems: PickProblem[] = [];
  for (const a of res.assets) {
    const mime = (a.mimeType || EXT[a.name.split('.').pop()?.toLowerCase() ?? ''] || '').toLowerCase();
    if (!(TITLE_DOC_TYPES as readonly string[]).includes(mime)) {
      problems.push({ kind: 'wrongType', name: a.name });
      continue;
    }
    const blob = a.file ?? (await (await fetch(a.uri)).blob());
    const size = a.size ?? blob.size;
    if (size > MAX_TITLE_DOC_BYTES) {
      problems.push({ kind: 'tooBig', name: a.name });
      continue;
    }
    files.push({ name: a.name, mime, size, data: await blobToBase64(blob) });
  }
  return { files, problems };
}
