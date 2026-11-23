import { describe, expect, it } from 'vitest';

import { cleanImage, cleanLinks, decodeImage, linkText } from '../src/media';

describe('media', () => {
  it('cleans links', () => {
    expect(cleanLinks([{ label: 'Pairings', url: 'example.org/pairings' }, { label: '', url: '' }, { url: 'http://chess.example/live' }])).toEqual({
      value: [
        { label: 'Pairings', url: 'https://example.org/pairings' },
        { label: '', url: 'https://chess.example/live' },
      ],
    });
    expect(cleanLinks([{ label: 'x', url: 'javascript:alert(1)' }])).toHaveProperty('error');
    expect(cleanLinks([{ label: 'no address' }])).toHaveProperty('error');
    expect(cleanLinks(Array.from({ length: 7 }, (_, i) => ({ url: `https://a${i}.example` })))).toHaveProperty('error');
    expect(linkText({ label: '', url: 'https://www.fide.com/news' })).toBe('fide.com');
  });
  it('cleans images', () => {
    expect(cleanImage(undefined)).toEqual({ value: undefined });
    expect(cleanImage(null)).toEqual({ value: null });
    expect(cleanImage('data:image/gif;base64,AAAA')).toHaveProperty('error');
    expect(cleanImage(`data:image/png;base64,${'A'.repeat(1_500_000)}`)).toHaveProperty('error');
    expect(cleanImage('data:image/png;base64,iVBORw0KGgo=')).toEqual({ value: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(decodeImage('data:image/png;base64,AQID')).toEqual({ mime: 'image/png', data: new Uint8Array([1, 2, 3]) });
  });
});
