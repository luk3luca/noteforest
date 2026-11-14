/**
 * `noteforest-md://` protocol registration for Markdown-local images.
 *
 * Must run before `app.whenReady()`. The handler never receives a filesystem
 * path from the renderer: the URL carries a registered root id and an encoded
 * relative path, validated again in `markdown-protocol-response.ts` and
 * `markdown-file.ts`.
 */

import { protocol } from 'electron';
import {
  MARKDOWN_SCHEME,
  markdownProtocolResponse,
} from './markdown-protocol-response.js';
import { resolveMarkdownAsset } from './markdown-file.js';

export { MARKDOWN_SCHEME } from './markdown-protocol-response.js';

export function registerMarkdownScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MARKDOWN_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

export function installMarkdownProtocol(): void {
  protocol.handle(MARKDOWN_SCHEME, (request) =>
    markdownProtocolResponse(request.url, resolveMarkdownAsset),
  );
}
