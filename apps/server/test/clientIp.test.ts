import { describe, expect, it } from 'vitest';
import { clientIp } from '../src/clientIp';

const req = (headers: Record<string, string | string[]>, remoteAddress = '10.0.0.1') => ({ socket: { remoteAddress }, headers });

describe('clientIp', () => {
  it('uses the socket address without a proxy, ignoring forwarded headers', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.1.1.1', 'fly-client-ip': '2.2.2.2' }), undefined)).toBe('10.0.0.1');
  });

  it('reads Fly-Client-IP on Fly, not the spoofable X-Forwarded-For', () => {
    expect(clientIp(req({ 'fly-client-ip': '203.0.113.7', 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }), 'fly')).toBe('203.0.113.7');
  });

  it('takes the last X-Forwarded-For entry, the one the proxy added', () => {
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 198.51.100.4' }), '1')).toBe('198.51.100.4');
    expect(clientIp(req({ 'x-forwarded-for': ['6.6.6.6', '198.51.100.4'] }), 'true')).toBe('198.51.100.4');
  });

  it('falls back to the socket when the header is missing', () => {
    expect(clientIp(req({}), 'fly')).toBe('10.0.0.1');
    expect(clientIp(req({}), '1')).toBe('10.0.0.1');
  });
});
