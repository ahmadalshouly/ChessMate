import { type MyProfile, type PublicProfile } from '@chessmate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryBlobStore, S3BlobStore, blobStoreFromEnv, signV4 } from '../src/avatars/storage';
import { DevProfileBackend, MemoryProfileStore, profileRoutes } from '../src/profiles';
import { ChessServer } from '../src/server';

// Smallest valid-looking files of each type: only the leading bytes are checked.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 2)]);

let server: ChessServer;
let base: string;
const blobs = new MemoryBlobStore();
const changes: [string, string | null][] = [];

beforeAll(async () => {
  const routes = profileRoutes(new DevProfileBackend(), new MemoryProfileStore(), Date.now, { blobs, onChange: (id, url) => void changes.push([id, url]) });
  server = new ChessServer({ port: 0, http: [routes] });
  base = `http://localhost:${await server.listen()}`;
});
afterAll(() => server.close());

const call = async <T = unknown>(method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T };
};

describe('profile pictures', () => {
  const token = 'dev:p1:pia';

  it('needs sign-in and a real image', async () => {
    expect((await call('PUT', '/api/me/avatar', { body: { image: JPEG.toString('base64') } })).status).toBe(401);
    expect((await call('PUT', '/api/me/avatar', { token, body: {} })).status).toBe(400);
    expect((await call('PUT', '/api/me/avatar', { token, body: { image: Buffer.from('<svg/>').toString('base64') } })).status).toBe(400);
  });

  it('uploads, serves, replaces and removes a picture', async () => {
    const up = await call<MyProfile>('PUT', '/api/me/avatar', { token, body: { image: `data:image/jpeg;base64,${JPEG.toString('base64')}` } });
    expect(up.status).toBe(200);
    const first = up.data.avatar.photo!;
    expect(first).toMatch(/^\/api\/avatars\/[a-f0-9]{32}\.jpg$/);
    expect(changes.at(-1)).toEqual(['p1', first]);

    const img = await fetch(base + first);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect(img.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await img.arrayBuffer())).toEqual(JPEG);

    // Others see it on the public profile.
    expect((await call<PublicProfile>('GET', '/api/profiles/pia')).data.avatar.photo).toBe(first);

    // Choosing a preset keeps the photo; edits can't set a photo themselves.
    const edit = await call<MyProfile>('PATCH', '/api/me/profile', { token, body: { avatar: { id: 'rook', tone: 'silver', photo: '/api/avatars/x.jpg' } } });
    expect(edit.data.avatar).toEqual({ id: 'rook', tone: 'silver', photo: first });

    const second = (await call<MyProfile>('PUT', '/api/me/avatar', { token, body: { image: PNG.toString('base64') } })).data.avatar.photo!;
    expect(second).toMatch(/\.png$/);
    expect(blobs.has(`avatars/${first.split('/').pop()}`)).toBe(false);
    expect((await fetch(base + first)).status).toBe(404);

    const removed = await call<MyProfile>('DELETE', '/api/me/avatar', { token });
    expect(removed.data.avatar).toEqual({ id: 'rook', tone: 'silver' });
    expect(changes.at(-1)).toEqual(['p1', null]);
    expect(blobs.has(`avatars/${second.split('/').pop()}`)).toBe(false);
  });

  it('rejects oversized pictures', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(1_600_000)]);
    expect((await call('PUT', '/api/me/avatar', { token, body: { image: big.toString('base64') } })).status).toBe(413);
  });

  it('only serves names it hands out', async () => {
    expect((await fetch(`${base}/api/avatars/..%2F..%2Fetc%2Fpasswd`)).status).toBe(404);
    expect((await fetch(`${base}/api/avatars/abc.jpg`)).status).toBe(404);
  });
});

describe('object storage', () => {
  it('signs requests like AWS documents (Signature V4 GET example)', () => {
    const h = signV4({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      headers: { range: 'bytes=0-9' },
      body: Buffer.alloc(0),
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 's3',
      date: new Date('2013-05-24T00:00:00Z'),
    });
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });

  it('signs requests like AWS documents (Signature V4 PUT example)', () => {
    const h = signV4({
      method: 'PUT',
      url: new URL('https://examplebucket.s3.amazonaws.com/test$file.text'),
      headers: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
      body: Buffer.from('Welcome to Amazon S3.'),
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 's3',
      date: new Date('2013-05-24T00:00:00Z'),
    });
    expect(h.authorization).toContain('Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');
  });

  it('talks path-style to the bucket', async () => {
    const seen: { method: string; url: string; type: string | null }[] = [];
    const fake = (async (url: URL, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      seen.push({ method: init.method!, url: String(url), type: headers['content-type'] ?? null });
      if (init.method === 'GET') return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } });
      return new Response(null, { status: init.method === 'DELETE' ? 204 : 200 });
    }) as unknown as typeof fetch;
    const s3 = new S3BlobStore({ endpoint: 'https://fly.storage.tigris.dev', bucket: 'cm-media', accessKeyId: 'k', secretAccessKey: 's', region: 'auto' }, fake);
    await s3.put('avatars/a.jpg', JPEG, 'image/jpeg');
    expect((await s3.get('avatars/a.jpg'))!.data).toEqual(JPEG);
    await s3.delete('avatars/a.jpg');
    expect(seen).toEqual([
      { method: 'PUT', url: 'https://fly.storage.tigris.dev/cm-media/avatars/a.jpg', type: 'image/jpeg' },
      { method: 'GET', url: 'https://fly.storage.tigris.dev/cm-media/avatars/a.jpg', type: null },
      { method: 'DELETE', url: 'https://fly.storage.tigris.dev/cm-media/avatars/a.jpg', type: null },
    ]);
  });

  it('uses the bucket that `fly storage create` configures, else local disk', () => {
    const env = { BUCKET_NAME: 'b', AWS_ENDPOINT_URL_S3: 'https://fly.storage.tigris.dev', AWS_ACCESS_KEY_ID: 'k', AWS_SECRET_ACCESS_KEY: 's' };
    expect(blobStoreFromEnv(env, '/tmp/x').description).toBe('S3 bucket b (fly.storage.tigris.dev)');
    expect(blobStoreFromEnv({}, '/tmp/x').description).toBe('local disk (/tmp/x)');
  });
});
