import { describe, expect, it, vi } from 'vitest';
import {
  ASSET_ERROR_HEADER,
  ASSET_SCHEME,
  assetIdFromRequest,
  assetProtocolResponse,
  type AssetRequestResolver,
} from '../src/main/asset-protocol-response';

const ID = 'a'.repeat(64);
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

function resolver(
  result: Awaited<ReturnType<AssetRequestResolver>>,
): AssetRequestResolver & { calls: string[] } {
  const calls: string[] = [];
  const fn = async (id: string) => {
    calls.push(id);
    return result;
  };
  return Object.assign(vi.fn(fn), { calls }) as unknown as AssetRequestResolver & {
    calls: string[];
  };
}

function url(id = ID): string {
  return `${ASSET_SCHEME}://asset/${id}`;
}

describe('asset protocol request parsing', () => {
  it('accepts only the canonical scheme, host, and 64-hex id', () => {
    expect(assetIdFromRequest(url())).toBe(ID);
    for (const candidate of [
      `https://asset/${ID}`,
      `${ASSET_SCHEME}://other/${ID}`,
      `${ASSET_SCHEME}://asset////${ID}`,
      `${ASSET_SCHEME}://asset/../${ID}`,
      `${ASSET_SCHEME}://asset/%2e%2e/${ID}`,
      `${ASSET_SCHEME}://asset/${'a'.repeat(63)}`,
      `${ASSET_SCHEME}://asset/${'A'.repeat(64)}`,
      `${ASSET_SCHEME}://asset/${ID}?query=1`,
      `${ASSET_SCHEME}://asset/${ID}#hash`,
      `${ASSET_SCHEME}://asset/${ID}/trailing`,
      'not a url',
    ]) {
      expect(assetIdFromRequest(candidate), candidate).toBeNull();
    }
  });
});

describe('asset protocol handler', () => {
  it('serves verified image bytes with an allow-listed MIME and no-store headers', async () => {
    const resolve = resolver({ ok: true, id: ID, mime: 'image/png', bytes: BYTES });
    const response = await assetProtocolResponse(url(), resolve);

    expect(resolve.calls).toEqual([ID]);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe(String(BYTES.byteLength));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get(ASSET_ERROR_HEADER)).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES);
  });

  it('returns typed 404 without bytes for a missing file, changed hash, or unsupported MIME', async () => {
    const cases = [
      {
        reason: 'asset-missing',
        result: { ok: false as const, id: ID, reason: 'asset-missing' as const, message: 'missing' },
      },
      {
        reason: 'asset-changed',
        result: { ok: false as const, id: ID, reason: 'asset-changed' as const, message: 'changed' },
      },
      {
        reason: 'asset-unsupported',
        result: {
          ok: false as const,
          id: ID,
          reason: 'asset-unsupported' as const,
          message: 'unsupported',
        },
      },
    ];
    for (const entry of cases) {
      const response = await assetProtocolResponse(url(), resolver(entry.result));
      expect(response.status, entry.reason).toBe(404);
      expect(response.headers.get(ASSET_ERROR_HEADER), entry.reason).toBe(entry.reason);
      expect(response.headers.get('content-type'), entry.reason).toBe(
        'text/plain; charset=utf-8',
      );
      expect(response.headers.get('cache-control'), entry.reason).toBe('no-store');
      expect(response.headers.get('x-content-type-options'), entry.reason).toBe('nosniff');
      const body = new Uint8Array(await response.arrayBuffer());
      // The body is a diagnostic string, never image bytes.
      expect(body).not.toEqual(BYTES);
      expect(new TextDecoder().decode(body)).toBe('Asset not found');
    }
  });

  it('refuses a resolver that reports a non-image MIME even when it says ok', async () => {
    const response = await assetProtocolResponse(
      url(),
      resolver({ ok: true, id: ID, mime: 'text/html', bytes: BYTES }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get(ASSET_ERROR_HEADER)).toBe('asset-unsupported');
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });

  it('rejects malformed URLs and resolver exceptions without reading bytes', async () => {
    const never = resolver({ ok: true, id: ID, mime: 'image/png', bytes: BYTES });
    const malformed = await assetProtocolResponse(`https://example.com/${ID}`, never);
    expect(malformed.status).toBe(404);
    expect(malformed.headers.get(ASSET_ERROR_HEADER)).toBe('asset-missing');
    expect(never.calls).toEqual([]);

    const failing: AssetRequestResolver = async () => {
      throw new Error('disk disappeared');
    };
    const failed = await assetProtocolResponse(url(), failing);
    expect(failed.status).toBe(404);
    expect(failed.headers.get(ASSET_ERROR_HEADER)).toBe('asset-missing');
  });

  it('keeps MIME allowlisting and response headers on the served response', async () => {
    for (const mime of ['image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']) {
      const response = await assetProtocolResponse(
        url(),
        resolver({ ok: true, id: ID, mime, bytes: BYTES }),
      );
      expect(response.status, mime).toBe(200);
      expect(response.headers.get('content-type'), mime).toBe(mime);
    }
  });
});
