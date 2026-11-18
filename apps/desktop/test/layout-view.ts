/**
 * Test-only anchor view for layout calls.
 *
 * Production builds the view from `DocumentSession`'s index. Tests that call
 * `layoutDocument` directly use the same index over their fixture document.
 */
import type { Document } from '@noteforest/core';
import { buildAnchorIndex } from '@noteforest/core';
import type { AnchorResolutionView } from '@noteforest/layout';

export function anchorViewForDocument(document: unknown): AnchorResolutionView {
  return buildAnchorIndex(document as Document).view();
}
