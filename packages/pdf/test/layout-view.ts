/** Test-only anchor view for `layoutDocument` calls over fixture documents. */
import type { Document } from '@noteforest/core';
import { buildAnchorIndex } from '@noteforest/core';
import type { AnchorResolutionView } from '@noteforest/layout';

export function anchorViewForDocument(document: unknown): AnchorResolutionView {
  return buildAnchorIndex(document as Document).view();
}
