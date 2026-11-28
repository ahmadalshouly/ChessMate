import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS, analyticsScreenName, cleanAnalyticsProps, parseAnalyticsBatch } from '../src';

// Firebase Analytics refuses these names (and GA4 keeps some for itself).
const FIREBASE_RESERVED = [
  'ad_activeview', 'ad_click', 'ad_exposure', 'ad_impression', 'ad_query', 'ad_reward', 'adunit_exposure', 'app_background', 'app_clear_data',
  'app_exception', 'app_remove', 'app_store_refund', 'app_store_subscription_cancel', 'app_store_subscription_convert', 'app_store_subscription_renew',
  'app_update', 'app_upgrade', 'dynamic_link_app_open', 'dynamic_link_app_update', 'dynamic_link_first_open', 'error', 'first_open', 'first_visit',
  'in_app_purchase', 'notification_dismiss', 'notification_foreground', 'notification_open', 'notification_receive', 'os_update', 'session_start',
  'session_start_with_rollout', 'user_engagement',
];

describe('analytics', () => {
  it('uses event names Google Analytics and Firebase accept', () => {
    for (const name of ANALYTICS_EVENTS) {
      expect(name).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
      expect(FIREBASE_RESERVED).not.toContain(name);
      expect(name.startsWith('firebase_') || name.startsWith('google_') || name.startsWith('ga_')).toBe(false);
    }
  });

  it('names screens by route pattern, never by id', () => {
    expect(analyticsScreenName(['(tabs)', 'index'])).toBe('/');
    expect(analyticsScreenName(['game', '[id]'])).toBe('/game/[id]');
    expect(analyticsScreenName(['(auth)', 'sign-in'])).toBe('/sign-in');
    expect(analyticsScreenName(['admin', 'players', 'index'])).toBe('/admin/players');
  });

  it('keeps only small flat props', () => {
    expect(cleanAnalyticsProps({ method: 'google', rated: true, n: 3, nested: { a: 1 }, BadKey: 'x', long: 'y'.repeat(300) })).toEqual({
      method: 'google',
      rated: true,
      n: 3,
      long: 'y'.repeat(100),
    });
    expect(cleanAnalyticsProps({})).toBeUndefined();
    expect(cleanAnalyticsProps([1])).toBeUndefined();
  });

  it('drops unknown events and refuses bad ids', () => {
    const now = 1_800_000_000_000;
    const ok = { deviceId: 'a1b2c3d4-e5f6', sessionId: 's1s2s3s4s5', platform: 'android', events: [] as unknown[] };
    expect(parseAnalyticsBatch({ ...ok, deviceId: 'x' }, now)).toBeNull();
    expect(parseAnalyticsBatch({ ...ok, deviceId: '<script>alert(1)</script>' }, now)).toBeNull();
    expect(parseAnalyticsBatch({ ...ok, platform: 'windows' }, now)).toBeNull();
    const b = parseAnalyticsBatch(
      { ...ok, events: [{ name: 'game_start', at: now - 1000, screen: '/play/online', props: { rated: true } }, { name: 'hack' }, { name: 'login', at: 5, screen: 'not a path' }] },
      now,
    );
    expect(b?.events).toEqual([
      { name: 'game_start', at: now - 1000, screen: '/play/online', props: { rated: true } },
      { name: 'login', at: now },
    ]);
  });

  it('caps a batch', () => {
    const events = Array.from({ length: 80 }, () => ({ name: 'screen_view', at: 1 }));
    expect(parseAnalyticsBatch({ deviceId: 'abcdefgh', sessionId: 'abcdefgh', platform: 'web', events }, 1)?.events).toHaveLength(50);
  });
});
