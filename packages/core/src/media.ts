/**
 * Images and links attached to posts and events (event cover, event news,
 * ChessMate news). Images travel as data URLs and are served from their own
 * cached endpoints, never inside lists.
 */

export interface PostLink {
  /** Text shown for the link (the address's host when left empty). */
  label: string;
  url: string;
}

export const MEDIA_LIMITS = {
  links: 6,
  linkLabel: 60,
  linkUrl: 500,
  /** A data URL of at most this many characters (about 1 MB of image). */
  imageChars: 1_400_000,
} as const;

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

type Clean<T> = { value: T } | { error: string; field?: string };

/** An image field: a data URL to set, null to remove, undefined to keep the current one. */
export function cleanImage(raw: unknown, field = 'image'): Clean<string | null | undefined> {
  if (raw === undefined) return { value: undefined };
  if (raw === null || raw === '') return { value: null };
  if (typeof raw !== 'string' || !IMAGE_DATA_URL.test(raw)) return { error: 'The image must be a PNG, JPEG or WebP picture', field };
  if (raw.length > MEDIA_LIMITS.imageChars) return { error: 'The image is too large (1 MB at most)', field };
  return { value: raw };
}

/**
 * One web link from a form: https, with http upgraded and a missing scheme
 * added. Empty means "no link".
 */
export function cleanWebLink(raw: unknown, field: string, max = MEDIA_LIMITS.linkUrl): Clean<string | null> {
  const s = typeof raw === 'string' ? raw.trim().slice(0, max) : '';
  if (!s) return { value: null };
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) throw new Error('no host');
    if (u.protocol === 'http:') u.protocol = 'https:';
    return { value: u.toString() };
  } catch {
    return { error: 'Enter a valid link, such as https://example.com', field };
  }
}

/** Up to six links: https (http is upgraded), with an optional label. */
export function cleanLinks(raw: unknown, field = 'links'): Clean<PostLink[]> {
  if (raw === undefined || raw === null) return { value: [] };
  if (!Array.isArray(raw)) return { error: 'Invalid links', field };
  const out: PostLink[] = [];
  for (const item of raw) {
    const r = (item && typeof item === 'object' ? item : {}) as { label?: unknown; url?: unknown };
    let url = typeof r.url === 'string' ? r.url.trim() : '';
    const label = typeof r.label === 'string' ? r.label.trim().slice(0, MEDIA_LIMITS.linkLabel) : '';
    if (!url && !label) continue;
    if (!url) return { error: 'Each link needs an address', field };
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (url.length > MEDIA_LIMITS.linkUrl) return { error: 'A link is too long', field };
    try {
      const u = new URL(url);
      if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname.includes('.')) throw new Error();
      if (u.protocol === 'http:') u.protocol = 'https:';
      url = u.toString();
    } catch {
      return { error: `Not a valid link: ${url.slice(0, 60)}`, field };
    }
    if (!out.some((l) => l.url === url)) out.push({ label, url });
  }
  if (out.length > MEDIA_LIMITS.links) return { error: `At most ${MEDIA_LIMITS.links} links`, field };
  return { value: out };
}

/** Text for a link: its label, or the address's host. */
export function linkText(l: PostLink): string {
  if (l.label) return l.label;
  try {
    return new URL(l.url).hostname.replace(/^www\./, '');
  } catch {
    return l.url;
  }
}

/** A stored data URL as bytes for serving. */
export function decodeImage(dataUrl: string | null | undefined): { mime: string; data: Uint8Array } | null {
  const m = dataUrl ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl) : null;
  if (!m) return null;
  const bin = typeof atob === 'function' ? atob(m[2]!) : '';
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  return { mime: m[1]!, data };
}
