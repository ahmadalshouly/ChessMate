import { describe, expect, it } from 'vitest';

// Pure modules only: no React Native imports, so this runs in Node.
import { AD_SPOTS, AD_SPOT_KEY } from '@chessmate/core';

import { interpolate, pluralCategory, resolve, type Lang } from '../src/i18n/core';
import { ar } from '../src/i18n/locales/ar';
import { de } from '../src/i18n/locales/de';
import { en } from '../src/i18n/locales/en';

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
const dicts = { en, ar, de };

type Node = string | { [k: string]: Node };
const PLURAL = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const isPlural = (n: Node): n is Record<string, string> => typeof n === 'object' && 'other' in n && Object.keys(n).every((k) => PLURAL.has(k));

function leaves(node: Node, prefix = ''): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (typeof node === 'string' || isPlural(node)) {
    out.set(prefix, typeof node === 'string' ? [node] : Object.values(node));
    return out;
  }
  for (const [k, v] of Object.entries(node)) for (const [kk, vv] of leaves(v, prefix ? `${prefix}.${k}` : k)) out.set(kk, vv);
  return out;
}
const placeholders = (forms: string[]) => new Set(forms.flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])));

describe('plural rules', () => {
  it('uses one/other for English and German', () => {
    expect([0, 1, 2, 5].map((n) => pluralCategory('en', n))).toEqual(['other', 'one', 'other', 'other']);
    expect(pluralCategory('de', 1)).toBe('one');
  });
  it('uses all six Arabic categories', () => {
    expect([0, 1, 2, 3, 10, 11, 99, 100, 103, 111].map((n) => pluralCategory('ar', n))).toEqual([
      'zero', 'one', 'two', 'few', 'few', 'many', 'many', 'other', 'few', 'many',
    ]);
  });
});

describe('resolve', () => {
  it('interpolates and picks plural forms', () => {
    expect(interpolate('Hi {name}', { name: 'Ahmad' })).toBe('Hi Ahmad');
    expect(resolve('en', dicts, 'games.moveCount', { count: 1 })).toBe('1 move');
    expect(resolve('de', dicts, 'games.moveCount', { count: 3 })).toBe('3 Züge');
    expect(resolve('ar', dicts, 'games.moveCount', { count: 2 })).toBe('نقلتان');
  });
  it('falls back to the key when nothing has it', () => {
    expect(resolve('de', dicts, 'nope.missing')).toBe('nope.missing');
  });
});

/** Every object key in a dictionary, at any depth. */
function keySegments(node: Node, out: string[] = []): string[] {
  if (typeof node === 'string' || isPlural(node)) return out;
  for (const [k, v] of Object.entries(node)) {
    out.push(k);
    keySegments(v, out);
  }
  return out;
}

describe('dictionary keys', () => {
  // `resolve` reads a dotted key as a path, so a key with a dot in it can never
  // be looked up: `ads.spot.home.feed` goes looking for home → feed. The type
  // checker does not catch it, because KeyPath happily joins such a key with a
  // dot and the result is a valid-looking TKey. This test is the only guard.
  for (const lang of ['en', 'ar', 'de'] as Lang[]) {
    it(`${lang} has no key containing a dot`, () => {
      expect(keySegments(dicts[lang] as Node).filter((k) => k.includes('.'))).toEqual([]);
    });
  }

  // Each ad spot's id has a dot, so the dictionaries key them by AD_SPOT_KEY instead.
  it('every ad spot has a name and a description in all three languages', () => {
    for (const spot of AD_SPOTS) {
      const seg = AD_SPOT_KEY[spot];
      for (const lang of ['en', 'ar', 'de'] as Lang[]) {
        expect(resolve(lang, dicts, `ads.spot.${seg}`), `ads.spot.${seg} (${lang})`).not.toBe(`ads.spot.${seg}`);
        expect(resolve(lang, dicts, `admin.ads.spotWhere.${seg}`), `admin.ads.spotWhere.${seg} (${lang})`).not.toBe(`admin.ads.spotWhere.${seg}`);
      }
    }
  });
});

describe('dictionaries', () => {
  const base = leaves(en as Node);
  for (const lang of ['ar', 'de'] as Lang[]) {
    const other = leaves(dicts[lang] as Node);
    it(`${lang} has exactly the English keys`, () => {
      expect([...other.keys()].sort()).toEqual([...base.keys()].sort());
    });
    it(`${lang} keeps every placeholder`, () => {
      const problems: string[] = [];
      for (const [key, forms] of base) {
        const want = placeholders(forms);
        want.delete('count'); // A plural form may spell the number out ("two moves").
        const got = placeholders(other.get(key) ?? []);
        for (const p of want) if (!got.has(p)) problems.push(`${key}: missing {${p}}`);
        for (const p of got) if (!placeholders(forms).has(p)) problems.push(`${key}: unknown {${p}}`);
      }
      expect(problems).toEqual([]);
    });
  }
});
