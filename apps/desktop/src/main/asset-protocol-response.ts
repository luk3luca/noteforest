/**
 * Pure response builder for the `noteforest-asset://` protocol.
 *
 * This module has no Electron import so handler behavior (status, headers,
 * MIME allowlist, no-byte failures) is unit-testable in plain Node. The
 * Electron entry point only registers the scheme and forwards requests here.
 */

import { SUPPORTED_IMAGE_MIMES } from '../shared/images.js';
import type { OpenAssetResolution } from './library.js';

export const ASSET_SCHEME = 'noteforest-asset';
export const ASSET_HOST = 'asset';
export const ASSET_ID_PATTERN = /^[0-9a-f]{64}$/;
export const ASSET_ERROR_HEADER = 'x-noteforest-asset-error';

export type AssetRequestResolver = (id: string) => Promise<OpenAssetResolution>;

function baseHeaders(): Record<string, string> {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  };
}

function typedFailure(reason: string): Response {
  return new Response('Asset not found', {
    status: 404,
    headers: {
      ...baseHeaders(),
      'content-type': 'text/plain; charset=utf-8',
      [ASSET_ERROR_HEADER]: reason,
    },
  });
}

/** Parse only the canonical `noteforest-asset://asset/<64-hex>` shape. */
export function assetIdFromRequest(requestUrl: string): string | null {
  // Reject traversal before URL normalization collapses `..` segments.
  const rawPath = requestUrl.replace(/^[a-z-]+:\/\/[^/]*/i, '').split(/[?#]/, 1)[0] ?? '';
  if (rawPath.includes('..') || /%2e/i.test(rawPath)) return null;
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${ASSET_SCHEME}:`) return null;
  if (url.host !== ASSET_HOST) return null;
  if (url.search.length > 0 || url.hash.length > 0) return null;
  const id = url.pathname.replace(/^\/+/, '');
  if (url.pathname !== `/${id}`) return null;
  return ASSET_ID_PATTERN.test(id) ? id : null;
}

/**
 * Handle one protocol request. Missing, changed, or unsupported assets return
 * a 404 with a typed `x-noteforest-asset-error` header and no image bytes; the
 * editor's `<img>` error path renders the placeholder.
 */
export async function assetProtocolResponse(
  requestUrl: string,
  resolve: AssetRequestResolver,
): Promise<Response> {
  const id = assetIdFromRequest(requestUrl);
  if (id === null) return typedFailure('asset-missing');

  let resolved: OpenAssetResolution;
  try {
    resolved = await resolve(id);
  } catch {
    return typedFailure('asset-missing');
  }
  if (!resolved.ok) return typedFailure(resolved.reason);
  // Defense in depth: even a resolver that lies about the record MIME cannot
  // serve a non-image response through this scheme.
  if (!SUPPORTED_IMAGE_MIMES.has(resolved.mime)) return typedFailure('asset-unsupported');

  return new Response(new Uint8Array(resolved.bytes), {
    status: 200,
    headers: {
      ...baseHeaders(),
      'content-type': resolved.mime,
      'content-length': String(resolved.bytes.byteLength),
    },
  });
}
