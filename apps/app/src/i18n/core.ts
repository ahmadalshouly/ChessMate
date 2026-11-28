/**
 * Tiny, dependency-free translation core: typed keys, `{name}` interpolation and
 * plural forms (CLDR categories, so Arabic gets zero/one/two/few/many/other).
 *
 * Keys are dotted paths into the English dictionary, e.g. `settings.language.title`.
 * English is the source of truth: every other language must have exactly the same keys,
 * which the type checker enforces (see `Messages`).
 */

export type Lang = 'en' | 'ar' | 'de' | 'es' | 'fr' | 'pt' | 'ru' | 'tr' | 'id' | 'hi' | 'zh' | 'ja' | 'ko';
/** Picker order: English first, then by native name in Latin script, then the other scripts. */
export const LANGS: readonly Lang[] = ['en', 'de', 'es', 'fr', 'id', 'pt', 'tr', 'ru', 'ar', 'hi', 'zh', 'ja', 'ko'];
export const RTL_LANGS: ReadonlySet<Lang> = new Set(['ar']);
/**
 * Languages whose script the bundled faces (Inter, Playfair, Cinzel, trimmed to Latin) don't
 * cover. Text there uses the platform's own font for that script (see `ui/theme/fonts.ts`).
 */
export const SYSTEM_FONT_LANGS: ReadonlySet<Lang> = new Set(['ru', 'hi', 'zh', 'ja', 'ko']);

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
/** A plural message. `other` is required; the rest are used where the language has them. */
export type Plural = { other: string } & Partial<Record<Exclude<PluralCategory, 'other'>, string>>;

type Tree = { readonly [key: string]: string | Plural | Tree };

/** A plural is an object with `other` and nothing but plural categories (so a group may still have an `other` key). */
type IsPlural<T> = T extends { other: string } ? (Exclude<keyof T, PluralCategory> extends never ? true : false) : false;

/** Same shape as the English dictionary, with strings and plurals left free to differ. */
export type Messages<T> = {
  [K in keyof T]: T[K] extends string ? string : IsPlural<T[K]> extends true ? Plural : Messages<T[K]>;
};

/**
 * Namespaces only staff see (the /admin console). Languages other than English, Arabic and
 * German leave them out, and those screens show English.
 */
export type StaffNamespace = 'admin' | 'pushAdmin';
export const STAFF_NAMESPACES: readonly StaffNamespace[] = ['admin', 'pushAdmin'];
/** A player-facing dictionary: every key but the staff console's. */
export type PlayerMessages<T> = Messages<Omit<T, StaffNamespace>>;

/** Every leaf path of a dictionary: `'a.b.c'`. Plural objects count as leaves. */
export type KeyPath<T> = {
  [K in keyof T & string]: T[K] extends string ? K : IsPlural<T[K]> extends true ? K : `${K}.${KeyPath<T[K]>}`;
}[keyof T & string];

export type Params = Record<string, string | number>;

const PLURAL_KEYS: ReadonlySet<string> = new Set<PluralCategory>(['zero', 'one', 'two', 'few', 'many', 'other']);

/** CLDR plural rules for the shipped languages (no Intl.PluralRules needed on Hermes). */
export function pluralCategory(lang: Lang, n: number): PluralCategory {
  const i = Math.abs(n);
  const int = Number.isInteger(i);
  switch (lang) {
    case 'ar': {
      if (i === 0) return 'zero';
      if (i === 1) return 'one';
      if (i === 2) return 'two';
      if (!int) return 'other';
      const m = i % 100;
      if (m >= 3 && m <= 10) return 'few';
      if (m >= 11 && m <= 99) return 'many';
      return 'other';
    }
    case 'ru': {
      if (!int) return 'other';
      const m10 = i % 10;
      const m100 = i % 100;
      if (m10 === 1 && m100 !== 11) return 'one';
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
      return 'many';
    }
    // French, Brazilian Portuguese and Hindi: 0 and 1 are singular.
    case 'fr':
    case 'pt':
    case 'hi':
      return i < 2 ? 'one' : 'other';
    // No grammatical plural.
    case 'zh':
    case 'ja':
    case 'ko':
    case 'id':
      return 'other';
    default:
      return i === 1 ? 'one' : 'other';
  }
}

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

function lookup(tree: Tree, key: string): string | Plural | undefined {
  let node: unknown = tree;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object' && Object.keys(node).every((k) => PLURAL_KEYS.has(k)) && typeof (node as Plural).other === 'string') return node as Plural;
  return undefined;
}

export function hasMessage(lang: Lang, dicts: Record<Lang, Tree>, key: string): boolean {
  return lookup(dicts[lang], key) !== undefined || lookup(dicts.en, key) !== undefined;
}

/**
 * Resolve a message: the active language first, then English, then the key itself
 * (so a missing string shows up as its key in development instead of crashing).
 */
export function resolve(lang: Lang, dicts: Record<Lang, Tree>, key: string, params?: Params): string {
  const msg = lookup(dicts[lang], key) ?? lookup(dicts.en, key);
  if (msg === undefined) {
    if (__DEV__) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (typeof msg === 'string') return interpolate(msg, params);
  const count = typeof params?.count === 'number' ? params.count : Number(params?.count ?? 0);
  const form = msg[pluralCategory(lang, count)] ?? msg.other;
  return interpolate(form, params);
}
