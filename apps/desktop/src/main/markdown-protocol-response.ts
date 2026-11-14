/**
 * Pure URL shape and response builder for the `noteforest-md://` protocol.
 *
 * A Markdown guest file may reference images relative to its own folder. The
 * renderer never receives a filesystem path it can load: it asks the main
 * process for a confined URL, and this protocol serves only registered roots,
 * only image extensions, and only paths that stay inside their root.
 *
 * No Electron import here, so the URL parser, traversal rules, MIME allowlist,
 * and failure shape are unit-testable in plain Node.
 */

import { IMAGE_MIME_BY_EXTENSION, SUPPORTED_IMAGE_MIMES } from '../shared/images.js';

export const MARKDOWN_SCHEME = 'noteforest-md';
export const MARKDOWN_HOST = 'asset';
export const MARKDOWN_ROOT_PATTERN = /^[0-9a-f]{16}$/;
export const MARKDOWN_ERROR_HEADER = 'x-noteforest-md-error';

export interface MarkdownAssetResolution {
  ok: boolean;
  bytes?: Uint8Array;
  mime?: string;
  reason?: string;
}

export type MarkdownAssetResolver = (
  rootId: string,
  relativePath: string,
) => Promise<MarkdownAssetResolution>;

/** Build the only URL shape the protocol accepts for one registered root. */
export function markdownAssetUrl(rootId: string, relativePath: string): string {
  const encoded = relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${MARKDOWN_SCHEME}://${MARKDOWN_HOST}/${rootId}/${encoded}`;
}

export interface MarkdownAssetRequest {
  rootId: string;
  relativePath: string;
}

/**
 * Parse `noteforest-md://asset/<16-hex-root>/<relative-image-path>`.
 * Traversal, encoded dots, backslashes, anchors, queries, and non-image
 * extensions are rejected before any filesystem access.
 */
export function parseMarkdownAssetUrl(requestUrl: string): MarkdownAssetRequest | null {
  const rawPath = requestUrl.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').split(/[?#]/, 1)[0] ?? '';
  if (rawPath.includes('..') || /%2e/i.test(rawPath) || rawPath.includes('\\')) return null;
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${MARKDOWN_SCHEME}:`) return null;
  if (url.host !== MARKDOWN_HOST) return null;
  if (url.search.length > 0 || url.hash.length > 0) return null;
  const segments = url.pathname
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment.length > 0);
  if (segments.length < 2) return null;
  const rootId = segments[0] ?? '';
  if (!MARKDOWN_ROOT_PATTERN.test(rootId)) return null;
  const decoded: string[] = [];
  for (const segment of segments.slice(1)) {
    let value: string;
    try {
      value = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (
      value.length === 0 ||
      value === '.' ||
      value === '..' ||
      value.startsWith('.') ||
      value.includes('/') ||
      value.includes('\\') ||
      value.includes('\0')
    ) {
      return null;
    }
    decoded.push(value);
  }
  const relativePath = decoded.join('/');
  const dot = relativePath.lastIndexOf('.');
  if (dot < 0) return null;
  const extension = relativePath.slice(dot).toLowerCase();
  if (IMAGE_MIME_BY_EXTENSION[extension] === undefined) return null;
  return { rootId, relativePath };
}

function baseHeaders(): Record<string, string> {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  };
}

function typedFailure(reason: string): Response {
  return new Response('Image not found', {
    status: 404,
    headers: {
      ...baseHeaders(),
      'content-type': 'text/plain; charset=utf-8',
      [MARKDOWN_ERROR_HEADER]: reason,
    },
  });
}

/** Serve one image request; every failure is a typed 404 with no bytes. */
export async function markdownProtocolResponse(
  requestUrl: string,
  resolve: MarkdownAssetResolver,
): Promise<Response> {
  const request = parseMarkdownAssetUrl(requestUrl);
  if (request === null) return typedFailure('invalid-path');
  let resolved: MarkdownAssetResolution;
  try {
    resolved = await resolve(request.rootId, request.relativePath);
  } catch {
    return typedFailure('image-missing');
  }
  if (!resolved.ok || resolved.bytes === undefined || resolved.mime === undefined) {
    return typedFailure(resolved.reason ?? 'image-missing');
  }
  // Defense in depth: the resolver cannot serve a non-image response through
  // this scheme.
  if (!SUPPORTED_IMAGE_MIMES.has(resolved.mime)) return typedFailure('unsupported-image');
  return new Response(new Uint8Array(resolved.bytes), {
    status: 200,
    headers: {
      ...baseHeaders(),
      'content-type': resolved.mime,
      'content-length': String(resolved.bytes.byteLength),
    },
  });
}
