import { describe, expect, it } from 'vitest';

import { AD_PERIODS, AD_SPOTS, AD_SPOT_INFO, isAdSpot, isLive, placementStatus, validateAdPlacement } from '../src/ads';
import { validateSponsorApplication } from '../src/tournaments';

const NOW = Date.UTC(2026, 0, 10);
const ok = { spot: 'home.feed', sponsor: 'Acme', title: 'Sponsor of the week', period: 'week' };

describe('ad spots', () => {
  it('describes every spot exactly once', () => {
    expect(new Set(AD_SPOTS).size).toBe(AD_SPOTS.length);
    for (const s of AD_SPOTS) expect(AD_SPOT_INFO[s]).toBeDefined();
    expect(Object.keys(AD_SPOT_INFO).sort()).toEqual([...AD_SPOTS].sort());
  });

  it('only accepts spots it knows', () => {
    expect(isAdSpot('home.feed')).toBe(true);
    expect(isAdSpot('home.banner')).toBe(false);
    expect(isAdSpot(null)).toBe(false);
  });
});

describe('validateAdPlacement', () => {
  it('turns a period into an end date', () => {
    const r = validateAdPlacement({ ...ok, startsAt: NOW }, NOW);
    expect('value' in r).toBe(true);
    if (!('value' in r)) return;
    expect(r.value.endsAt).toBe(NOW + 7 * 86_400_000);
    expect(r.value.sponsor).toBe('Acme');
  });

  it('starts right away when no start is given', () => {
    const r = validateAdPlacement(ok, NOW);
    if (!('value' in r)) throw new Error(r.error);
    expect(r.value.startsAt).toBe(NOW);
  });

  it('offers every period as a whole number of days', () => {
    for (const p of AD_PERIODS) {
      const r = validateAdPlacement({ ...ok, period: p.key, startsAt: NOW }, NOW);
      if (!('value' in r)) throw new Error(r.error);
      expect(r.value.endsAt - NOW).toBe(p.days * 86_400_000);
    }
  });

  it('rejects an unknown spot, a missing sponsor and a missing title', () => {
    expect(validateAdPlacement({ ...ok, spot: 'nope' }, NOW)).toMatchObject({ field: 'spot' });
    expect(validateAdPlacement({ ...ok, sponsor: 'A' }, NOW)).toMatchObject({ field: 'sponsor' });
    expect(validateAdPlacement({ ...ok, title: '' }, NOW)).toMatchObject({ field: 'title' });
  });

  it('upgrades a link to https and rejects nonsense', () => {
    const r = validateAdPlacement({ ...ok, url: 'http://acme.example/go' }, NOW);
    if (!('value' in r)) throw new Error(r.error);
    expect(r.value.url).toBe('https://acme.example/go');
    expect(validateAdPlacement({ ...ok, url: 'not a link' }, NOW)).toMatchObject({ field: 'url' });
  });

  it('adds a scheme to a bare host', () => {
    const r = validateAdPlacement({ ...ok, url: 'acme.example' }, NOW);
    if (!('value' in r)) throw new Error(r.error);
    expect(r.value.url).toBe('https://acme.example/');
  });

  it('needs a period or an end date', () => {
    expect(validateAdPlacement({ spot: 'home.feed', sponsor: 'Acme', title: 'Hello' }, NOW)).toMatchObject({ field: 'endsAt' });
  });

  it('rejects an end before the start, and a run that is far too long', () => {
    expect(validateAdPlacement({ ...ok, startsAt: NOW, endsAt: NOW - 1 }, NOW)).toMatchObject({ field: 'endsAt' });
    expect(validateAdPlacement({ ...ok, startsAt: NOW, endsAt: NOW + 500 * 86_400_000 }, NOW)).toMatchObject({ field: 'endsAt' });
  });

  it('keeps the stored image when the field is absent, and clears it on null', () => {
    const kept = validateAdPlacement(ok, NOW);
    if (!('value' in kept)) throw new Error(kept.error);
    expect(kept.value.image).toBeUndefined();
    const cleared = validateAdPlacement({ ...ok, image: null }, NOW);
    if (!('value' in cleared)) throw new Error(cleared.error);
    expect(cleared.value.image).toBeNull();
  });

  it('rejects an image that is not a picture data URL', () => {
    expect(validateAdPlacement({ ...ok, image: 'data:text/html;base64,AAA' }, NOW)).toMatchObject({ field: 'image' });
  });
});

describe('when a placement is on screen', () => {
  const run = { startsAt: NOW, endsAt: NOW + 7 * 86_400_000, stopped: false };

  it('is live inside its period only', () => {
    expect(isLive(run, NOW - 1)).toBe(false);
    expect(isLive(run, NOW)).toBe(true);
    expect(isLive(run, run.endsAt - 1)).toBe(true);
    // It stops by itself at the end, so nobody has to take it down.
    expect(isLive(run, run.endsAt)).toBe(false);
  });

  it('is never live once stopped by hand', () => {
    expect(isLive({ ...run, stopped: true }, NOW + 1000)).toBe(false);
  });

  it('names its state for the console', () => {
    expect(placementStatus(run, NOW - 1)).toBe('scheduled');
    expect(placementStatus(run, NOW)).toBe('live');
    expect(placementStatus(run, run.endsAt)).toBe('ended');
    expect(placementStatus({ ...run, stopped: true }, NOW)).toBe('stopped');
  });
});

describe('sponsor applications carry a spot preference', () => {
  const base = { name: 'Dana Reed', email: 'dana@acme.example', message: 'We would like to sponsor the home screen.' };

  it('keeps a spot it knows', () => {
    const r = validateSponsorApplication({ ...base, spot: 'home.feed' });
    if (!('value' in r)) throw new Error(r.error);
    expect(r.value.spot).toBe('home.feed');
  });

  it('treats a missing or unknown spot as no preference', () => {
    for (const spot of [undefined, null, 'made.up']) {
      const r = validateSponsorApplication({ ...base, spot });
      if (!('value' in r)) throw new Error(r.error);
      expect(r.value.spot).toBeNull();
    }
  });
});
