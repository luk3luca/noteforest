/**
 * `noteforest-asset://` protocol for package-local image assets.
 *
 * The renderer is sandboxed and has no filesystem access. The protocol is the
 * only bridge that lets an `<img>` load bytes from the open document package:
 *
 *   noteforest-asset://asset/<lowercase-sha256>
 *
 * The handler never accepts a path from the URL. It resolves the id against a
 * live document's canonical `assets` map, verifies the recorded path stays
 * inside that package's `assets/` directory, and only then reads the file. A
 * missing record or file is a plain 404, which the editor renders as the
 * missing-asset placeholder instead of crashing.
 */

import { protocol } from 'electron';
import { promises as fs } from 'node:fs';
import { resolveOpenAsset } from './library.js';

export const ASSET_SCHEME = 'noteforest-asset';
const ASSET_HOST = 'asset';
const ASSET_ID = /^[0-9a-f]{64}$/;

/** Must run before `app.whenReady()`; Electron requires early scheme registration. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

function notFound(): Response {
  return new Response('Asset not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function installAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return notFound();
    }
    if (url.host !== ASSET_HOST) return notFound();
    const id = url.pathname.replace(/^\/+/, '');
    if (!ASSET_ID.test(id)) return notFound();

    const resolved = await resolveOpenAsset(id);
    if (resolved === null) return notFound();

    try {
      const bytes = await fs.readFile(resolved.filePath);
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          'content-type': resolved.mime,
          'content-length': String(bytes.byteLength),
          // Assets are content-addressed and immutable; a re-open after an
          // external change must not be served from a stale cache.
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return notFound();
    }
  });
}
