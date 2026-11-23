import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** A stored file: its bytes and media type. */
export interface Blob {
  data: Buffer;
  contentType: string;
}

/**
 * Where uploaded files (profile pictures) live. Keys are plain paths such as
 * "avatars/3f9c….jpg", made only of letters, digits, "/", "." and "-".
 */
export interface BlobStore {
  /** Short name for logs, e.g. "S3 bucket chessmate-media". */
  readonly description: string;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Blob | null>;
  delete(key: string): Promise<void>;
}

export class MemoryBlobStore implements BlobStore {
  readonly description = 'memory (lost on restart)';
  private readonly files = new Map<string, Blob>();
  async put(key: string, data: Buffer, contentType: string) {
    this.files.set(key, { data: Buffer.from(data), contentType });
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
  has(key: string) {
    return this.files.has(key);
  }
}

/**
 * Files on local disk, for development and single-machine setups. The media type
 * is kept in a ".type" file beside each file. Not for Fly.io: a machine's disk is
 * replaced on every deploy unless a volume is mounted.
 */
export class FileBlobStore implements BlobStore {
  readonly description: string;
  constructor(private readonly dir: string) {
    this.description = `local disk (${dir})`;
  }
  private path(key: string) {
    if (!SAFE_KEY.test(key)) throw new Error(`Unsafe storage key: ${key}`);
    return join(this.dir, key);
  }
  async put(key: string, data: Buffer, contentType: string) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    await writeFile(`${p}.type`, contentType);
  }
  async get(key: string) {
    const p = this.path(key);
    try {
      const [data, type] = await Promise.all([readFile(p), readFile(`${p}.type`, 'utf8').catch(() => 'application/octet-stream')]);
      return { data, contentType: type.trim() };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
  async delete(key: string) {
    const p = this.path(key);
    await Promise.all([rm(p, { force: true }), rm(`${p}.type`, { force: true })]);
  }
}

export interface S3Config {
  /** e.g. https://fly.storage.tigris.dev, https://<account>.r2.cloudflarestorage.com, https://s3.eu-central-1.amazonaws.com */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** "auto" for Tigris and R2. */
  region: string;
}

/**
 * Any S3-compatible object storage (Tigris on Fly.io, Cloudflare R2, AWS S3, MinIO),
 * spoken to directly with Signature V4 requests, so no SDK is needed. Objects stay
 * private; the game server reads them and serves them to the app.
 */
export class S3BlobStore implements BlobStore {
  readonly description: string;
  constructor(
    private readonly cfg: S3Config,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.description = `S3 bucket ${cfg.bucket} (${new URL(cfg.endpoint).host})`;
  }

  private url(key: string) {
    if (!SAFE_KEY.test(key)) throw new Error(`Unsafe storage key: ${key}`);
    // Path-style addressing: works on Tigris, R2, MinIO and AWS alike.
    return new URL(`${this.cfg.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(this.cfg.bucket)}/${key}`);
  }

  private async send(method: 'GET' | 'PUT' | 'DELETE', key: string, body?: Buffer, contentType?: string) {
    const url = this.url(key);
    const headers = signV4({
      method,
      url,
      headers: contentType ? { 'content-type': contentType } : {},
      body: body ?? Buffer.alloc(0),
      accessKeyId: this.cfg.accessKeyId,
      secretAccessKey: this.cfg.secretAccessKey,
      region: this.cfg.region,
      service: 's3',
      date: this.now(),
    });
    return this.fetchImpl(url, { method, headers, body: body ? new Uint8Array(body) : undefined });
  }

  async put(key: string, data: Buffer, contentType: string) {
    const res = await this.send('PUT', key, data, contentType);
    if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${await res.text().catch(() => '')}`.trim());
  }

  async get(key: string) {
    const res = await this.send('GET', key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Storage read failed: ${res.status}`);
    return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }

  async delete(key: string) {
    const res = await this.send('DELETE', key);
    if (!res.ok && res.status !== 404) throw new Error(`Storage delete failed: ${res.status}`);
  }
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding of one path segment, as Signature V4 wants it. */
const encodeSegment = (s: string) => encodeURIComponent(decodeURIComponent(s)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * AWS Signature Version 4 for one request (header-based, signed payload).
 * Returns the headers to send: the given ones plus host, x-amz-date,
 * x-amz-content-sha256 and authorization.
 */
export function signV4(r: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: Buffer;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  date: Date;
}): Record<string, string> {
  const amzDate = r.date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(r.body);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.headers)) headers[k.toLowerCase()] = v.trim();
  headers.host = r.url.host;
  headers['x-amz-date'] = amzDate;
  headers['x-amz-content-sha256'] = payloadHash;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const path = r.url.pathname.split('/').map(encodeSegment).join('/') || '/';
  const query = [...r.url.searchParams.entries()]
    .map(([k, v]) => [encodeSegment(k), encodeSegment(v)] as const)
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonicalRequest = [r.method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${day}/${r.region}/${r.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${r.secretAccessKey}`, day), r.region), r.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(stringToSign).digest('hex');
  delete headers.host; // fetch sets it itself
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${r.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

/**
 * Object storage when it is configured, otherwise local disk.
 *
 * `fly storage create` (Tigris) sets BUCKET_NAME, AWS_ENDPOINT_URL_S3,
 * AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_REGION as app secrets, so on
 * Fly.io creating the bucket is all it takes. Other providers: set the same
 * variables by hand.
 */
export function blobStoreFromEnv(env: NodeJS.ProcessEnv, fallbackDir: string): BlobStore {
  const bucket = env.BUCKET_NAME || env.S3_BUCKET;
  const endpoint = env.AWS_ENDPOINT_URL_S3 || env.S3_ENDPOINT;
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  if (bucket && endpoint && accessKeyId && secretAccessKey) {
    return new S3BlobStore({ bucket, endpoint, accessKeyId, secretAccessKey, region: env.AWS_REGION || 'auto' });
  }
  return new FileBlobStore(fallbackDir);
}
