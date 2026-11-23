import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

const LOGO_MAX_PX = 512;
/** Pictures (event covers, news): longest side after scaling on the web. */
const PICTURE_MAX_PX = 1600;
/** The server takes pictures up to this many characters of data URL (about 1 MB). */
export const PICTURE_MAX_CHARS = 1_400_000;
/** The server takes logos up to this many characters of data URL (about 300 KB). */
export const LOGO_MAX_CHARS = 400_000;

async function fileAsDataUrl(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.readAsDataURL(blob);
  });
}

/** Web only: scales a large logo down (keeping transparency); phones send the file as it is. */
async function shrink(dataUrl: string, maxPx = LOGO_MAX_PX, keepBelow = 200_000): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return dataUrl;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not read the image'));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && dataUrl.length <= keepBelow) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', 0.9);
  const out = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  return out.length < dataUrl.length ? out : dataUrl;
}

/** Lets the user pick a PNG, JPEG or WebP logo; returns a data URL, or null when cancelled. */
export async function pickLogo(): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true });
  const asset = r.canceled ? null : r.assets?.[0];
  if (!asset) return null;
  return shrink(await fileAsDataUrl(asset.uri));
}

/**
 * Lets the user pick a picture (PNG, JPEG or WebP) for a cover or a post.
 * On the web large pictures are scaled down; on phones the file is sent as it
 * is, so it must already be under the size limit.
 */
export async function pickPicture(): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true });
  const asset = r.canceled ? null : r.assets?.[0];
  if (!asset) return null;
  return shrink(await fileAsDataUrl(asset.uri), PICTURE_MAX_PX, 600_000);
}
