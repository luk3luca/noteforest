/**
 * `noteforest-asset://` protocol registration for package-local image assets.
 *
 * The renderer is sandboxed and has no filesystem access. The protocol is the
 * only bridge that lets an `<img>` load bytes from the open document package:
 *
 *   noteforest-asset://asset/<lowercase-sha256>
 *
 * The handler never accepts a path from the URL. It resolves the id against a
 * live document's canonical `assets` map, verifies the recorded path and real
 * `assets/` root stay inside the package, and serves only SHA-256-verified
 * bytes. A missing/changed record or file is a typed 404, which the editor
 * renders as the placeholder instead of crashing. Response headers and MIME
 * allowlisting live in `asset-protocol-response.ts` so they are unit-tested.
 */

import { protocol } from 'electron';
import { assetProtocolResponse, ASSET_SCHEME } from './asset-protocol-response.js';
import { resolveOpenAsset } from './library.js';

export { ASSET_SCHEME } from './asset-protocol-response.js';

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

export function installAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, (request) =>
    assetProtocolResponse(request.url, resolveOpenAsset),
  );
}
